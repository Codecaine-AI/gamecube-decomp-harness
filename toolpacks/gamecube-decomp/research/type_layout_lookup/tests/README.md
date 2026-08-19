# Type Layout Lookup Tests

Run the stdlib-only suite from the repository root:

```sh
python3 -m unittest discover -s toolpacks/gamecube-decomp/research/type_layout_lookup/tests -v
```

Tests parse an inline clang layout dump. They do not invoke clang, scan the
project source tree, or write shared tool data.

