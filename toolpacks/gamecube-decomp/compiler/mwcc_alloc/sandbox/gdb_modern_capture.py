"""Load pinned MWCC capture with an explicit inexpensive stage-only profile."""
import importlib.util
import os
from pathlib import Path

OMITTED_BREAKPOINTS = (
    'CodeMotionAcceptBreakpoint', 'CodeMotionFinishBreakpoint',
    'CodeMotionInstructionBreakpoint', 'CodeMotionPredicateBreakpoint',
    'DirectVirtualRegisterBreakpoint', 'LocalHomeListBreakpoint',
    'LocalObjectInsertionBreakpoint', 'PCodeAllocationReturnBreakpoint',
    'PCodeBuilderReturnBreakpoint', 'PCodeCloneBreakpoint',
    'PCodeCloneReturnBreakpoint', 'PCodeWrapperBreakpoint',
    'PeepholeRuleEntryBreakpoint', 'StackFrameCheckpointBreakpoint',
    'StackObjectAlignmentBreakpoint', 'StackObjectAllocatorBreakpoint',
    'StackObjectAllocatorReturnBreakpoint', 'VirtualRegisterAllocatorBreakpoint',
    'VirtualRegisterCounterResetBreakpoint', 'VirtualRegisterReturnBreakpoint',
)
OMISSIONS = ['creation', 'clone', 'virtual_register_events', 'stack', 'local_objects',
             'home_list', 'code_motion', 'peephole_events']


def configure(module, detail):
    if detail == 'full':
        return
    if detail != 'stages':
        raise ValueError('trace detail must be stages or full')

    class OmittedBreakpoint:
        def __init__(self, *args, **kwargs):
            self.enabled = False

    for name in OMITTED_BREAKPOINTS:
        setattr(module, name, OmittedBreakpoint)
    module.CaptureSession.write_creation_trace = lambda *args, **kwargs: None
    original_write = module.write_snapshot

    def write_collected(path, snapshot):
        if path.name.startswith(('code-motion-', 'peephole-', 'pcode-creations-',
                                 'stack-frame-', 'local-objects-', 'home-list-')):
            return
        snapshot['capture_detail'] = 'stages'
        snapshot['omissions'] = OMISSIONS
        original_write(path, snapshot)

    module.write_snapshot = write_collected


def load():
    base = Path(__file__).resolve().parent
    candidates = [root / 'vendor/mwcc-decomp/tools/gdb/allocator_snapshot.py'
                  for root in (base, base.parent)]
    path = next((item for item in candidates if item.is_file()), None)
    if path is None:
        raise RuntimeError('Pinned modern MWCC capture is not provisioned')
    spec = importlib.util.spec_from_file_location('mwcc_modern_gdb', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    configure(module, os.environ.get('MWCC_ALLOC_TRACE_DETAIL', 'stages'))


if __name__ == '__main__':
    load()
