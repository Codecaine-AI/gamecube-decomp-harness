import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_capture_cli import load_capture_module


class TraceCaptureTests(unittest.TestCase):
    def setUp(self):
        self.capture = load_capture_module()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.args = self.capture.parse_args([
            '--repo-root', str(self.root), '--unit', 'x.c', '--function', 'selected',
            '--capture', 'trace', '--out-dir', 'build/trace',
        ])
        self.sha = next(iter(self.capture.COMPILER_HASHES))

    def artifacts(self, directory, name='selected'):
        names = [f'pcode-0007-{stage}.json' for stage in self.capture.TRACE_STAGES]
        names += [f'pcode-creations-0007-{stage}.json' for stage in self.capture.TRACE_STAGES]
        names += [f'{kind}-0007.json' for kind in ('allocator', 'stack-frame', 'local-objects', 'home-list')]
        names += ['coloring-0007-fpr-01-before.json', 'coloring-0007-fpr-01-after.json']
        for filename in names:
            (directory / filename).write_text(json.dumps({
                'format': 'fixture', 'function_identity': {'name': name},
                'capture_index': 7, 'target_sha256': self.sha,
            }))
        return names

    def mocks(self, debugger=None, sha=None):
        from contextlib import ExitStack
        stack = ExitStack()
        stack.enter_context(patch.object(self.capture.sys, 'platform', 'linux'))
        stack.enter_context(patch.object(self.capture, 'provisioning_probe', return_value=None))
        stack.enter_context(patch.object(self.capture, 'modern_debugger_script', return_value=Path('vendor/gdb.py')))
        command = stack.enter_context(patch.object(self.capture, 'run_command', return_value=subprocess.CompletedProcess([], 0, 'wibo mwcceppc.exe -o out.o src/x.c', '')))
        stack.enter_context(patch.object(self.capture, 'sha256_file', return_value=sha or self.sha))
        stack.enter_context(patch.object(self.capture, 'read_elf_functions', return_value=['other'] * 6 + ['selected']))
        stack.enter_context(patch.object(self.capture, 'select_wibo', return_value=self.root / 'wibo'))
        capture = stack.enter_context(patch.object(self.capture, 'capture_with_debugger', side_effect=debugger))
        self.addCleanup(stack.close)
        return command, capture

    def test_trace_retains_every_artifact_and_selects_source_identity(self):
        def debugger(*args, **kwargs):
            self.assertEqual(kwargs['trace_function'], 'selected')
            self.artifacts(args[4])
            (args[4].parent / 'capture.o').write_bytes(b'object')
            return {'gdb_returncode': 0, 'qemu_returncode': 0}
        command, _ = self.mocks(debugger)
        result = self.capture.execute(self.args)
        self.assertEqual(result['status'], 'ok', result)
        self.assertEqual(result['selection']['capture_index'], 7)
        self.assertEqual(result['selection']['method'], 'symtab_order_fallback')
        files = {Path(item['path']).name for item in result['files']}
        self.assertIn('coloring-0007-fpr-01-after.json', files)
        self.assertIn('capture.o', files)
        self.assertEqual(len(files), 29)
        self.assertEqual(command.call_count, 2)
        self.assertEqual(command.call_args_list[0].args[0][:3], ['ninja', '-t', 'commands'])

    def test_hash_gate_precedes_any_compiler_execution(self):
        command, capture = self.mocks(sha='unsupported')
        result = self.capture.execute(self.args)
        self.assertEqual(result['status'], 'compiler_hash_mismatch')
        capture.assert_not_called()
        self.assertEqual(command.call_args_list[0].args[0][:3], ['ninja', '-t', 'commands'])

    def test_host_never_probes_or_builds(self):
        with patch.object(self.capture.sys, 'platform', 'darwin'), patch.object(self.capture, 'run_command') as command, patch.object(self.capture, 'provisioning_probe') as probe:
            self.assertEqual(self.capture.execute(self.args)['status'], 'sandbox_required')
            command.assert_not_called()
            probe.assert_not_called()

    def test_functions_without_home_entries_are_complete(self):
        self.artifacts(self.root)
        (self.root / 'home-list-0007.json').unlink()
        index, files = self.capture.trace_files(self.root, 'selected', self.sha)
        self.assertEqual(index, 7)
        self.assertTrue(files)

    def test_debugger_uses_pinned_script_and_modern_name_selector(self):
        from unittest.mock import MagicMock
        processes = []
        def launch(command, **kwargs):
            process = MagicMock()
            process.poll.return_value = None
            process.returncode = 0
            process.communicate.return_value = ('', '')
            processes.append((command, kwargs))
            return process
        with patch.object(self.capture.subprocess, 'Popen', side_effect=launch), patch.object(self.capture, 'terminate_process'), patch.object(self.capture.time, 'sleep'), patch.object(self.capture, 'free_tcp_port', return_value=12345):
            result = self.capture.capture_with_debugger(
                self.root, self.root / 'wibo', self.root / 'compiler', [],
                self.root, self.sha, 'GC/1.2.5n', 999, 60,
                trace_function='selected',
            )
        self.assertEqual(result['gdb_returncode'], 0)
        command, kwargs = processes[1]
        self.assertIn(f'mwcc-auto-capture {self.root} 999 ninji', command)
        self.assertTrue(any('gdb_modern_capture.py' in arg for arg in command))
        self.assertNotIn('MWCC_ALLOC_ONLY_INDEX', kwargs['env'])
        self.assertTrue(all(options['start_new_session'] for _, options in processes))

    def test_unavailable_identity_uses_index_without_claiming_name_verified(self):
        self.artifacts(self.root)
        for path in self.root.glob('*.json'):
            data = json.loads(path.read_text())
            data['function_identity'] = {'name': None, 'status': 'cache_empty', 'kind': 3}
            path.write_text(json.dumps(data))
        index, _ = self.capture.trace_files(self.root, 'selected', self.sha, 'stages', 7)
        self.assertEqual(index, 7)
        with self.assertRaisesRegex(ValueError, 'Unexpected function index'):
            self.capture.trace_files(self.root, 'selected', self.sha, 'stages', 8)

    def test_stages_requires_no_creation_or_stack_artifacts(self):
        self.artifacts(self.root)
        for path in self.root.glob('*.json'):
            if path.name.startswith(('pcode-creations-', 'stack-frame-', 'local-objects-', 'home-list-')):
                path.unlink()
        self.assertEqual(self.capture.trace_files(self.root, 'selected', self.sha, 'stages', 7)[0], 7)
        with self.assertRaisesRegex(ValueError, 'Incomplete trace'):
            self.capture.trace_files(self.root, 'selected', self.sha, 'full', 7)

    def test_shim_omits_uncollected_files_and_keeps_genuine_stages(self):
        import importlib.util
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        spec = importlib.util.spec_from_file_location('modern_shim', self.capture.SCRIPT_DIR / 'gdb_modern_capture.py')
        shim = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(shim)
        writer = MagicMock()
        module = SimpleNamespace(CaptureSession=type('Session', (), {}), write_snapshot=writer)
        shim.configure(module, 'stages')
        module.write_snapshot(Path('code-motion-0007.json'), {})
        writer.assert_not_called()
        snapshot = {'blocks': []}
        module.write_snapshot(Path('pcode-0007-final.json'), snapshot)
        writer.assert_called_once()
        self.assertIn('creation', snapshot['omissions'])
        self.assertFalse(module.StackObjectAllocatorBreakpoint().enabled)

    def test_wrong_identity_and_incomplete_trace_are_rejected(self):
        self.artifacts(self.root, name='neighbor')
        with self.assertRaisesRegex(ValueError, 'Unexpected function identity'):
            self.capture.trace_files(self.root, 'selected', self.sha)
        self.artifacts(self.root)
        (self.root / 'pcode-0007-final.json').unlink()
        with self.assertRaisesRegex(ValueError, 'Incomplete trace'):
            self.capture.trace_files(self.root, 'selected', self.sha)

    def test_failed_debugger_does_not_publish_partial_capture(self):
        def debugger(*args, **kwargs):
            self.artifacts(args[4])
            return {'gdb_returncode': 1, 'qemu_returncode': 0}
        self.mocks(debugger)
        self.assertEqual(self.capture.execute(self.args)['status'], 'capture_failed')
        self.assertTrue((self.root / 'build/trace/gdb_stderr.log').exists())
        self.assertTrue((self.root / 'build/trace/pcode-0007-final.json').exists())

    def test_timeout_cleans_both_process_groups(self):
        from unittest.mock import MagicMock
        qemu, gdb = MagicMock(), MagicMock()
        qemu.poll.return_value = None
        qemu.communicate.return_value = ('', '')
        gdb.poll.return_value = None
        gdb.communicate.side_effect = [subprocess.TimeoutExpired('gdb', 60), ('', ''), ('', '')]
        with patch.object(self.capture.subprocess, 'Popen', side_effect=[qemu, gdb]), patch.object(self.capture, 'terminate_process') as terminate, patch.object(self.capture.time, 'sleep'), patch.object(self.capture, 'free_tcp_port', return_value=12345):
            result = self.capture.capture_with_debugger(
                self.root, self.root / 'wibo', self.root / 'compiler', [],
                self.root, self.sha, 'GC/1.2.5', 0, 60, trace_function='selected',
            )
        self.assertTrue(result['timed_out'])
        self.assertTrue(any(call.args == (gdb,) for call in terminate.call_args_list))
        self.assertTrue(any(call.args == (qemu,) for call in terminate.call_args_list))

    def test_escaping_output_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as outside:
            (self.root / 'build').symlink_to(outside, target_is_directory=True)
            self.mocks()
            with self.assertRaisesRegex(self.capture.ArgumentError, 'escapes'):
                self.capture.execute(self.args)

    def test_legacy_selection_still_excludes_fpr(self):
        paths = [Path('allocator-0007.json'), Path('coloring-0007-gpr-01-before.json'), Path('coloring-0007-fpr-01-before.json')]
        self.assertEqual(len(self.capture.files_for_capture(paths, 7, 'pair')), 2)


if __name__ == '__main__':
    unittest.main()
