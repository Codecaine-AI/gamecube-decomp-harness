# TMewManager Inline Constructor Candidate

Optional reconstruction, not yet applied or compiled.
The existing factory already constructs TMewManager, but the class constructor is only declared and has no definition.
The class adds no fields, and its three virtual overrides already have definitions in `src/Animal/AnimalManager.cpp`.
No new factory calls or fake bodies are needed.

Original caller evidence is `build/GMSJ01/asm/System/MarNameRefGen_Enemy.s:250-265`, addresses 0x800fe60c-0x800fe648.
The caller compares MewManager, allocates 0x60 bytes, calls TAnimalManagerBase(name), writes the TMewManager vtable at offset zero, and returns the allocation.
Name argument @3937 is literally "?", matching the current default parameter.
The complete map contains no standalone TMewManager constructor symbol.
This demonstrates an inlined forwarding constructor with no additional work.

Patch fills the existing constructor declaration with `: TAnimalManagerBase(name) { }` in the game header.
The empty compound statement is not a placeholder; base construction and generated derived-vtable assignment are the complete target behavior.
The exact existing base body is at AnimalManager.cpp:16-23.

Expected strict gain is emission of the missing TAnimalManagerBase weak destructor in the Enemy factory, to be verified with MWCC.
Primary header consumers are AnimalBase.cpp, AnimalNerve.cpp, AnimalManager.cpp, and MarNameRefGen_Enemy.cpp.
Require unchanged matches in all consumers, original factory construction sequence, correct destructor body if emitted, unchanged strict errors elsewhere, and `ninja changes_all`.
