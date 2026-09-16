# MWCC Template Binding Probe

Executed only in this artifact directory, using the exact compiler flags extracted from the MarNameRefGen Ninja rule and MWCC GC/1.2.5.
All four compile exits were zero.
Wine prefix was the already-initialized isolated `.wine-audit`; no runtime restart or shutdown occurred.
No Ninja or repository build/source mutations occurred.

| Method Definition | Instantiation | Virtual Method Binding | Inline Destructor Binding |
|---|---|---|---|
| In class | Implicit | Weak | Weak |
| In class | Explicit class | Weak | Weak |
| Out of class | Implicit | Weak | Weak |
| Out of class | Explicit class | Global | Weak |

All eval, set, and destructor instruction bytes are identical across the four objects; codegen-comparison.json records the bytes.
Relocation symbols in the destructor remain the same vtable and delete function.
The function emission order changes: explicit class instantiation emits set before eval under inline-deferred, versus eval before set when implicit.

This supports moving existing game template method bodies out of the class plus explicit instantiation to produce original global binding, while preserving weak binding for implicit specializations.
It explains why the prior class-instantiation-only trial could not change binding.
It does not establish that a real shared-header patch preserves callers or exact original symbol order; that still needs parent regression testing.

Full commands, source, compile logs, nm listings, disassembly, and JSON results are retained here.
