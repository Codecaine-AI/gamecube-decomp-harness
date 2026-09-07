import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SUITE = Path(__file__).resolve().parents[1]
API = SUITE / 'api/analyze.py'
SHA = '0443b5c02b1aa7b575b61e0e24c4d5ad6bed8fd54cc42de5a2204a5216001914'


class AnalyzeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copyfile(SUITE / 'tests/fixtures/allocator-valid.json', self.root / 'allocator.json')

    def call(self, mode, path, *args):
        result = subprocess.run([sys.executable, str(API), '--repo-root', str(self.root), '--mode', mode, '--input', path, '--json', *args], capture_output=True, text=True, timeout=65)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value))

    def coloring(self):
        return {'format':'mwcc-coloring-snapshot-v1', 'compiler':'GC/1.2.5', 'target_sha256':SHA, 'register_class':'gpr', 'register_count':34, 'capture_index':1, 'function_pointer':'0x123', 'simplify_order':[33,32], 'nodes':[{'virtual_register':r,'physical_register':r,'neighbors':[]} for r in range(32)] + [{'virtual_register':32,'physical_register':-1,'neighbors':[33]}, {'virtual_register':33,'physical_register':-1,'neighbors':[32]}]}

    def pair(self):
        before = self.coloring()
        after = copy.deepcopy(before)
        after['nodes'][32]['physical_register'] = 3
        after['nodes'][33]['physical_register'] = 0
        self.write('before.json', before)
        self.write('after.json', after)
        return before, after

    def test_provenance_explain_origins(self):
        allocator=json.loads((self.root/'allocator.json').read_text())
        allocator['blocks'][0]['instructions'][0]['operands']=[{'kind':0,'flags':2,'reg':32,'raw':'00'*12}]
        self.write('allocator.json',allocator)
        result = self.call('provenance','allocator.json','--output','provenance-result.json')
        self.assertEqual(result['status'],'ok',result)
        self.write('provenance.json',result['result'])
        register = result['result']['registers'][0]['id']
        self.assertEqual(self.call('explain','provenance.json','--register',register)['status'],'ok')
        self.assertEqual(self.call('origins','provenance.json')['status'],'ok')
        self.assertEqual(self.call('explain','provenance.json','--register','fpr:65535')['status'],'invalid_input')

    def test_provenance_rejects_conflicting_function_evidence(self):
        allocator=json.loads((self.root/'allocator.json').read_text())
        allocator.update(capture_index=1, function_pointer='0x111', function_identity={'name':'first_function','function_object':'0x111'})
        self.write('allocator.json',allocator)
        coloring=json.loads((SUITE/'tests/fixtures/coloring-before.json').read_text())
        coloring.update(capture_index=1, function_identity={'name':'first_function','function_object':'0x111'})
        creations={'format':'mwcc-pcode-creation-trace-v1','compiler':'GC/1.2.5','target_sha256':SHA,'capture_index':1,'function_pointer':'0x111','function_identity':{'name':'first_function','function_object':'0x111'},'events':[]}
        self.write('coloring.json',coloring)
        self.write('creations.json',creations)
        result=self.call('provenance','allocator.json','--coloring','coloring.json','--creations','creations.json')
        self.assertEqual(result['status'],'ok',result)
        for name,original,flag in [('coloring.json',coloring,'--coloring'),('creations.json',creations,'--creations')]:
            for mismatch in ('name','pointer','index'):
                value=copy.deepcopy(original)
                if mismatch=='name':
                    value['function_identity']['name']='unrelated_function'
                elif mismatch=='pointer':
                    value['function_pointer']='0x222'
                    value['function_identity']['function_object']='0x222'
                else:
                    value['capture_index']=2
                self.write(name,value)
                result=self.call('provenance','allocator.json',flag,name)
                self.assertEqual(result['status'],'invalid_input',(mismatch,result))
                self.assertIn('identity mismatch',result['error'])
            self.write(name,original)
        # An unnamed legacy allocator must not hide conflicts between join inputs.
        allocator.pop('function_pointer')
        allocator.pop('function_identity')
        self.write('allocator.json',allocator)
        other=copy.deepcopy(coloring)
        other['function_identity']['name']='unrelated_function'
        self.write('other-coloring.json',other)
        result=self.call('provenance','allocator.json','--coloring','coloring.json','--coloring','other-coloring.json')
        self.assertEqual(result['status'],'invalid_input',result)

    def test_inverse_replay_gate_and_search(self):
        before,after=self.pair()
        good=self.call('inverse','before.json','--after','after.json','--target','32=0')
        self.assertEqual(good['status'],'ok',good)
        self.assertTrue(good['result']['trusted'])
        self.assertEqual(good['result']['solution_count'],1)
        after['nodes'][32]['physical_register']=29
        self.write('after.json',after)
        bad=self.call('inverse','before.json','--after','after.json','--target','32=0')
        self.assertEqual(bad['status'],'baseline_replay_mismatch',bad)
        self.assertNotIn('solution_count',bad['result'])

    def test_large_inverse_prefix_returns_bounded_witness(self):
        before,after=self.pair()
        extra=[{'virtual_register':r,'physical_register':-1,'neighbors':[]} for r in range(34,42)]
        before['nodes'] += copy.deepcopy(extra)
        after['nodes'] += copy.deepcopy(extra)
        for node in after['nodes'][34:]:
            node['physical_register']=0
        before['simplify_order']=list(range(34,42))+[33,32]
        after['simplify_order']=before['simplify_order']
        self.write('before.json',before)
        self.write('after.json',after)
        result=self.call('inverse','before.json','--after','after.json','--target','32=0','--target','33=3')
        self.assertEqual(result['status'],'search_limited',result)
        self.assertEqual(result['result']['witness']['swap'],[32,33])
        self.assertEqual(result['result']['pair_transpositions_tested'],1)
        self.assertEqual(len(result['result']['witness']['changed_colors']),2)

    def test_source_rank_requires_scheduled_stage_and_identity(self):
        before,after=self.pair()
        self.write('coloring-0001-gpr-01-before.json',before)
        self.write('coloring-0001-gpr-01-after.json',after)
        result=self.call('source-rank','.','--function-index','1','--target','32=0')
        self.assertEqual(result['status'],'invalid_arguments')
        pcode=json.loads((self.root/'allocator.json').read_text())
        pcode.update(capture_index=2,function_pointer='0x123')
        self.write('pcode-0001-scheduled.json',pcode)
        result=self.call('source-rank','.','--function-index','1','--target','32=0')
        self.assertEqual(result['status'],'invalid_input')
        self.assertIn('identity mismatch',result['error'])
        pcode['capture_index']=1
        self.write('pcode-0001-scheduled.json',pcode)
        result=self.call('source-rank','.','--function-index','1','--target','32=3')
        self.assertEqual(result['status'],'ok',result)
        self.assertTrue(result['result']['trusted'])
        identity={'function_object':'0x123','name':None,'status':'cache_empty'}
        for name,value in [('coloring-0001-gpr-01-before.json',before),('coloring-0001-gpr-01-after.json',after)]:
            value.pop('function_pointer',None)
            value['function_identity']=identity
            self.write(name,value)
        pcode['function_identity']=identity
        self.write('pcode-0001-scheduled.json',pcode)
        result=self.call('source-rank','.','--function-index','1','--target','32=3')
        self.assertEqual(result['status'],'ok',result)
        result=self.call('source-rank','.','--function-index','1','--target','32=0','--fixed-object','v65000')
        self.assertEqual(result['status'],'invalid_input',result)

    def test_stack_valid_and_malformed(self):
        trace={'format':'mwcc-stack-frame-trace-v1','compiler':'GC/1.2.5','target_sha256':SHA,'object_allocations':[], 'frame_finalization':None}
        self.write('stack.json',trace)
        result=self.call('stack','stack.json')
        self.assertEqual(result['status'],'ok',result)
        trace['object_allocations']=[{'sequence':2}]
        self.write('stack.json',trace)
        self.assertEqual(self.call('stack','stack.json')['status'],'invalid_input')

    def test_missing_malformed_and_mode_validation(self):
        for mode,path,args in [('provenance','missing.json',[]), ('inverse','allocator.json',['--target','1=2']), ('explain','allocator.json',[]), ('stack','allocator.json',['--degree-search','1']), ('source-rank','.', ['--function-index','0','--target','1=2']), ('inverse','allocator.json',['--after','allocator.json','--target','v1=r2'])]:
            with self.subTest(mode=mode,args=args):
                self.assertEqual(self.call(mode,path,*args)['status'],'invalid_arguments')
        (self.root/'bad.json').write_text('{')
        self.assertEqual(self.call('provenance','bad.json')['status'],'invalid_input')
        self.write('bad.json',[])
        self.assertEqual(self.call('provenance','bad.json')['status'],'invalid_input')

    def test_paths_reject_escaping_symlinks_and_input_overwrite(self):
        with tempfile.TemporaryDirectory() as outside:
            other=Path(outside)
            (other/'data.json').write_text('{}')
            (self.root/'escape').symlink_to(other,target_is_directory=True)
            for path,args in [('escape/data.json',[]), ('allocator.json',['--output','escape/out.json']), ('allocator.json',['--output','allocator.json'])]:
                self.assertEqual(self.call('provenance',path,*args)['status'],'invalid_arguments')
            self.assertFalse((other/'out.json').exists())
        with (self.root/'large.json').open('wb') as stream:
            stream.truncate(32*1024*1024+1)
        self.assertEqual(self.call('provenance','large.json')['status'],'invalid_arguments')

    def test_large_result_is_complete_artifact_and_bounded_inline(self):
        allocator=json.loads((self.root/'allocator.json').read_text())
        block=allocator['blocks'][0]
        allocator['blocks']=[dict(copy.deepcopy(block), index=index, successors=[]) for index in range(2000)]
        self.write('large-allocator.json',allocator)
        result=self.call('provenance','large-allocator.json')
        self.assertEqual(result['status'],'ok',result)
        self.assertLess(len(json.dumps(result)),12000)
        self.assertTrue(result['result']['inline_truncated'])
        artifact=self.root/result['files'][0]['path']
        complete=json.loads(artifact.read_text())
        self.assertEqual(len(complete['instructions']),2000)
        self.assertEqual(len(complete['blocks']),2000)
        self.assertGreater(artifact.stat().st_size,100000)

    def test_vendored_files_match_pin(self):
        vendor=SUITE/'vendor/mwcc-decomp'
        pin=json.loads((vendor/'PIN.json').read_text())
        self.assertEqual(pin['revision'],'0f0e1dbc7496d1a0bdf00798ff6752e813e0d0d0')
        for name,digest in pin['files'].items():
            self.assertEqual(hashlib.sha256((vendor/name).read_bytes()).hexdigest(),digest,name)


if __name__ == '__main__':
    unittest.main()
