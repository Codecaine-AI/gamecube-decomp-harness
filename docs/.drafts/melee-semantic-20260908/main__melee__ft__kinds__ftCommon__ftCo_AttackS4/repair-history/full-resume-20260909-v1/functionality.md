# Common forward smash

Revision `c302741689bd67c361cd7faadb221df3193992c3`. All canonical/rendered C1-245 and H1-16 read; three receipts, no parser errors. Terminal empty lines count toward rendering totals, while new code citations stop at C244/H15.

General input gives A plus horizontal magnitude/timer qualification priority over C-stick. The C-stick helper requires previous absolute X below and current absolute X at/above the common threshold. Angles use atan2(Y, abs(X)). The Dash-specific predicate accepts A toward existing facing without a tilt timer; its alternate C-stick route may choose either side. Dash calls it within the opening phase after special, immediate item throw and grab checks. The name hypothesis CheckInputFromDash remains supported.

Held-item override first handles LR, class zero, class three with depleted-item predicate, or the C-stick-permission predicate. It selects F4/B4 by requested sign times current facing. Otherwise class two writes facing then dispatches swing variant two; class three writes facing then calls shooting entry, whose own pickup opportunity and item-kind branches remain delegated. No handled item means facing is written before character dispatch. Ness, Peach and GameWatch specialized routines receive the object only: respectively bat setup, a random weapon motion excluding the previous choice, and torch accessory setup. Pikachu/Pichu run common angle entry then pause/resume effect hitlag callbacks. Other kinds use common entry.

The switch table covers kinds 8..24 with seventeen four-byte relocated code destinations. Ness/Peach/GameWatch and Pikachu/Pichu destinations differ from default. Existing source .data is 68 bytes, split is 72 with a four-byte gap; both have WRITE|ALLOC. Raw zero words in relocatable objects are not null dispatch entries: assembly and relocations identify their targets.

Angle selection preserves the exact current lookup spellings: angle > xB8 plus AttackS4S lookup x8 selects Hi; > xBC plus AttackS4LwS lookup selects HiS; < xC4 plus AttackLw4 lookup selects Lw; < xC0 plus AttackHi4 lookup selects LwS; otherwise S. The lookup returns indexed motion data, with a Nana-to-Popo fallback under its own conditions. It does not translate the supplied enum through the motion-state table. Common entry clears allow_interrupt, command zero and throw flags, changes the chosen state at frame zero/speed one/zero blend, then runs animation setup.

Anim delegates natural completion to the common neutral dispatcher. IASA checks side/up/neutral/down specials then grab when interruptible, checks the A-plus-command Link/Young Link forward-smash follow-up if no prior return, and then checks remaining attacks and movement when interruptible. Attack100 is a misleading canonical name here; its checked body dispatches SpecialHi. Phys selects above-walk-scaled friction, but the lower helper chooses animation-driven acceleration when x594_b0 is set. Coll performs shared ground checking/Fall entry. Motion states 58..62 register all four callbacks.

Literal pool contains zero, one and minus one. Source is 12 bytes WRITE|ALLOC; split is 16 bytes ALLOC including a trailing zero word. Frozen report hash matches. No build ran.

All 60 existing fact versions and 47 exact outgoing records have individual dispositions. Original links remain complete, including historical locators and repeated endpoints. No source or shared KB writes.

Motion-record x8 is size_t. Its availability checks test nonzero numeric values, preserving the exact probed motion IDs and branch order. Five fact corrections are proposed.
