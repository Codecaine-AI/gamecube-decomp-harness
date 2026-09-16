## Stream orientation

`src/MSL/wchar_io.c` defines only `int fwide(FILE* stream, int mode)`. It reads the stream's file kind and, unless closed, its orientation. A closed stream returns 0 immediately. An unoriented stream becomes wide-oriented for positive mode or character-oriented for negative mode; zero leaves it unchanged. This branch returns the original mode, not a normalized sign. Already wide-oriented and character-oriented streams return 1 and -1 respectively without mutation, regardless of mode. The function calls no subordinate routines and performs no allocation or lifetime management.

The switch has no default, and there is no return after it. Consequently, the source supplies no explicit result for an orientation outside the three named cases. Numeric encodings and reachability of such states are not established by this file. The function also does not check for a null stream.

The complete rendered view matches canonical source, with no substitutions or parse errors. `fwide` remains an appropriate name; no rename is warranted. Five baseline facts are retained; one signature/result description is clarified to avoid claiming exhaustive return behavior.

Status: synthesized; independent review and live promotion pending.
