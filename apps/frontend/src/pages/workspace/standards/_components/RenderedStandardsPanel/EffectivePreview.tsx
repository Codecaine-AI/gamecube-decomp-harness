import { useState } from "react";
import { Check, Copy } from "@/icons";
import { Button, PanelHeader, PanelSection } from "@/components/primitives";
import { num, type StandardsPayload } from "@/lib/format";
import { PromptXmlViewer } from "./PromptXmlViewer";

export function EffectivePreview({ payload }: { payload: StandardsPayload | null }) {
  const [copied, setCopied] = useState(false);
  if (!payload) return null;

  const accepted = payload.records.filter((record) => record.status === "accepted" && record.workerFacing !== false);
  const canonicalExamples = accepted.filter((record) => record.canonicalExample).length;
  const xml = payload.effectiveXml || "";

  async function copyXml() {
    if (!xml) return;
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <PanelSection>
      <PanelHeader
        title={
          <>
            Effective Prompt{" "}
            <span className="font-normal text-dim">
              — {num(accepted.length)} accepted standard{accepted.length === 1 ? "" : "s"}, {num(canonicalExamples)} canonical example
              {canonicalExamples === 1 ? "" : "s"} injected
            </span>
          </>
        }
        right={
          <Button icon={copied ? <Check size={13} /> : <Copy size={13} />} onClick={() => void copyXml()} title="Copy the rendered XML to the clipboard." type="button">
            {copied ? "Copied" : "Copy XML"}
          </Button>
        }
      />
      <div className="mt-3">
        <PromptXmlViewer xml={xml} />
      </div>
    </PanelSection>
  );
}
