## MSL ctype

The unit defines three immutable `const unsigned char[256]` lookup tables. `__ctype_map` classifies ASCII bytes using the flags declared in the header; its omitted upper-half initializers yield zero classification flags for bytes 128–255. `__lower_map` converts ASCII A–Z to a–z, and `__upper_map` converts a–z to A–Z; both preserve all other byte values.

`tolower` and `toupper` preserve exactly the integer sentinel -1. Every other integer, including other negative and out-of-byte-range inputs, is masked with `0xFF` before lookup, and the selected unsigned byte is returned as `int`. Neither routine mutates state or calls another function. The header's `isalpha`, `isdigit`, `isspace`, `isupper`, and `isxdigit` instead cast their input to `unsigned char` and return classification masks, not necessarily Boolean 1. They do not have a separate EOF branch. The header exposes the constant tables for shared use; no allocation or runtime initialization is involved.

Canonical and rendered files were reviewed completely. The renderer reported no substitutions or parse errors; the existing standard function names fit their behavior. Eleven existing facts remain supported. One inferred-type fact needs correction because source declarations alone cannot establish compiled contiguity, section placement, or array order in the binary.

Status: synthesized; independent review and live promotion pending.
