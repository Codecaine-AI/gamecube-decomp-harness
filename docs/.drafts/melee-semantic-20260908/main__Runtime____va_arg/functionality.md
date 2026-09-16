## Runtime variadic extraction

`src/Runtime/__va_arg.c` contains `__va_arg(va_list v_list, unsigned char type)`. Its implementation is guarded by `MWERKS_GEKKO`. It updates caller-provided variadic-list state and returns an argument address, rather than copying out a typed value. The canonical name remains appropriate; the rendered view makes no substitutions. Existing purpose and data-flow facts are retained.

### Category-dependent behavior

- The default path uses the GPR cursor, four-byte slots, a limit of eight slots, and a one-slot increment.
- Category `4` bypasses register selection: it aligns `input_arg_area` upward to 16 bytes, advances that pointer by 16 bytes, and immediately returns the aligned address without updating either register cursor.
- Category `3` selects the FPR cursor, eight-byte slots, and a register-save-area offset of 32 bytes.
- Category `2` uses eight-byte arguments and two GPR slots. It reduces the availability threshold to seven and rounds an odd available GPR index upward before selecting the argument. The availability test precedes that rounding.
- If register storage is available, the function computes an address within `reg_save_area` and advances the selected register cursor. Otherwise, it sets that cursor to eight, aligns `input_arg_area` to the argument size, and advances the overflow pointer by that size.
- Category `0` dereferences the selected slot as a pointer before returning. Other categories return the selected storage address directly. Codes outside `0`, `2`, `3`, and `4` follow the default four-byte path; this source contains no explicit category validation.

Evidence: [category selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/__va_arg.c#L12-L41), [storage selection, advancement, and indirection](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/__va_arg.c#L42-L56).

### Scope and limitations

The function allocates no storage and performs no cleanup; returned addresses depend on externally supplied argument storage and its lifetime. This file does not establish callers' storage lifetimes or the language-level meanings of every numeric category. Without `MWERKS_GEKKO`, the function body contains no return statement; the implemented extraction behavior must not be generalized to that configuration. No compiled section or layout claims are made. Evidence: [complete function and guard](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/__va_arg.c#L9-L58).

Status: researched; no-change lead bypass; independent review and live promotion pending.
