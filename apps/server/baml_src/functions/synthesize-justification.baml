// Calibration augmentation (plan §6.9, M12): writes one good or one bad
// justification for a real flagged hunk. Results are flagged synthetic and
// used only for threshold selection, never in the held-out split.

enum JustificationQuality {
  GOOD @description("A justification that should be accepted")
  BAD @description("A plausible-sounding justification that should be rejected")
}

class SynthesizedJustification {
  justification string @description("The justification text, written as the worker would write it")
  rationale string @description("For the human reviewer only: why this justification is good or bad")
}

function SynthesizeJustification(advisory: AdvisoryCase, quality: JustificationQuality) -> SynthesizedJustification {
  client KernelDefault
  prompt #"
    {{ _.role("system") }}
    You write test data for a reviewer of decompilation lint findings. Workers
    edit C source until a function compiles to the exact machine code of the
    original game. The linter flagged the code below as an llm_review
    advisory: it may stay only when matching the original binary requires it,
    and the worker must justify keeping it.

    Write one {{ quality }} justification for keeping the flagged code, in
    the voice of the worker, two to five sentences.
    {% if quality == "GOOD" %}
    A good justification names a concrete reason tied to matching the
    original binary, such as the instruction, register, offset, stack layout
    or data section the flagged pattern produces, says why the cleaner
    alternative does not match, and is consistent with the hunk. Base every
    claim on the hunk and the finding; do not cite exact numbers the hunk does
    not show.
    {% else %}
    A bad justification sounds plausible but should be rejected. Give it one
    realistic flaw: a vague or generic claim, a style preference, a reason not
    tied to matching the binary, or a claim the hunk contradicts. Do not make
    it obviously absurd.
    {% endif %}
    Never mention that the text is synthetic or a test.

    {{ ctx.output_format }}

    {{ _.role("user") }}
    {{ RenderAdvisorySubject(advisory) }}
  "#
}
