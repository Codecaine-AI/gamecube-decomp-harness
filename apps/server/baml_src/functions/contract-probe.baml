// Render and parse target for the kernel adapter contract and its tests.

class ProbeResult {
  ok bool
}

function ContractProbe(text: string) -> ProbeResult {
  client KernelDefault
  prompt #"
    {{ _.role("system") }}
    Reply whether the text below is non-empty.

    {{ ctx.output_format }}

    {{ _.role("user") }}
    {{ text }}
  "#
}
