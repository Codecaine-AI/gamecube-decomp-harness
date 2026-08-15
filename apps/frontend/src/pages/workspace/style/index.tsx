import { RotateCcw } from "@/icons";
import { DEFAULT_GRAIN_SETTINGS, GRAIN_BLEND_OPTIONS, SOFTENING_CHANNEL_OPTIONS, type GrainBlendMode, type GrainSettings, type GrainSettingsPatch } from "@/lib/styleSettings";
import { Button, CheckboxField, InfoRows, PageHeader, PanelSection, PanelTitle } from "@/components/primitives";
import type { CycleView } from "@/pages/workspace/_lib/types";
import { StyleSlider } from "./_components/StyleSlider";

function percentLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function degreeLabel(value: number): string {
  return `${Math.round(value)}deg`;
}

function pxLabel(value: number): string {
  return `${value.toFixed(1)}px`;
}

export function StylePage({
  grainSettings,
  onGrainSettingsChange,
  view,
}: {
  grainSettings: GrainSettings;
  onGrainSettingsChange: (updates: GrainSettingsPatch) => void;
  view: CycleView;
}) {
  return (
    <>
      <PageHeader kicker={view.game?.displayName ?? "No game selected"} title="Style" />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-[minmax(320px,0.75fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <PanelSection>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <PanelTitle className="mb-0">Global Grain</PanelTitle>
                <Button icon={<RotateCcw size={13} />} onClick={() => onGrainSettingsChange(DEFAULT_GRAIN_SETTINGS)} type="button">
                  Reset
                </Button>
              </div>
              <CheckboxField checked={grainSettings.enabled} label="Enable grain" onChange={(event) => onGrainSettingsChange({ enabled: event.currentTarget.checked })} />
              <div className="mt-4 grid gap-4">
                <StyleSlider label="Intensity" max={0.24} min={0} onChange={(opacity) => onGrainSettingsChange({ opacity })} step={0.01} value={grainSettings.opacity} valueLabel={percentLabel(grainSettings.opacity)} />
                <StyleSlider label="Density" max={1.6} min={0.25} onChange={(frequency) => onGrainSettingsChange({ frequency })} step={0.05} value={grainSettings.frequency} valueLabel={grainSettings.frequency.toFixed(2)} />
                <StyleSlider label="Contrast" max={2.2} min={0.55} onChange={(contrast) => onGrainSettingsChange({ contrast })} step={0.05} value={grainSettings.contrast} valueLabel={`${grainSettings.contrast.toFixed(2)}x`} />
                <label className="block text-[10px] uppercase tracking-[0.08em] text-dim">
                  <span>Blend</span>
                  <select className="mt-1.5 text-[13px] normal-case tracking-normal" onChange={(event) => onGrainSettingsChange({ blendMode: event.currentTarget.value as GrainBlendMode })} value={grainSettings.blendMode}>
                    {GRAIN_BLEND_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </PanelSection>
            <PanelSection>
              <PanelTitle>Softening Mix</PanelTitle>
              <div className="grid gap-4">
                {SOFTENING_CHANNEL_OPTIONS.map((option) => (
                  <StyleSlider
                    key={option.id}
                    label={option.label}
                    max={1}
                    min={0}
                    onChange={(value) => onGrainSettingsChange({ softening: { [option.id]: value } })}
                    step={0.01}
                    value={grainSettings.softening[option.id]}
                    valueLabel={percentLabel(grainSettings.softening[option.id])}
                  />
                ))}
              </div>
            </PanelSection>
            <PanelSection>
              <PanelTitle>SVG Normal</PanelTitle>
              <CheckboxField checked={grainSettings.svgNormal.enabled} label="Enable SVG normal" onChange={(event) => onGrainSettingsChange({ svgNormal: { enabled: event.currentTarget.checked } })} />
              <div className="mt-4 grid gap-4">
                <StyleSlider label="Opacity" max={0.2} min={0} onChange={(opacity) => onGrainSettingsChange({ svgNormal: { opacity } })} step={0.01} value={grainSettings.svgNormal.opacity} valueLabel={percentLabel(grainSettings.svgNormal.opacity)} />
                <StyleSlider label="Texture" max={1.8} min={0.12} onChange={(frequency) => onGrainSettingsChange({ svgNormal: { frequency } })} step={0.02} value={grainSettings.svgNormal.frequency} valueLabel={grainSettings.svgNormal.frequency.toFixed(2)} />
                <StyleSlider label="Depth" max={8} min={0} onChange={(depth) => onGrainSettingsChange({ svgNormal: { depth } })} step={0.1} value={grainSettings.svgNormal.depth} valueLabel={grainSettings.svgNormal.depth.toFixed(1)} />
                <StyleSlider label="Light Angle" max={360} min={0} onChange={(azimuth) => onGrainSettingsChange({ svgNormal: { azimuth } })} step={1} value={grainSettings.svgNormal.azimuth} valueLabel={degreeLabel(grainSettings.svgNormal.azimuth)} />
                <StyleSlider label="Light Height" max={90} min={5} onChange={(elevation) => onGrainSettingsChange({ svgNormal: { elevation } })} step={1} value={grainSettings.svgNormal.elevation} valueLabel={degreeLabel(grainSettings.svgNormal.elevation)} />
              </div>
            </PanelSection>
            <PanelSection>
              <PanelTitle>CSS Bevel</PanelTitle>
              <CheckboxField checked={grainSettings.cssBevel.enabled} label="Enable CSS bevel" onChange={(event) => onGrainSettingsChange({ cssBevel: { enabled: event.currentTarget.checked } })} />
              <div className="mt-4 grid gap-4">
                <StyleSlider label="Strength" max={1} min={0} onChange={(strength) => onGrainSettingsChange({ cssBevel: { strength } })} step={0.01} value={grainSettings.cssBevel.strength} valueLabel={percentLabel(grainSettings.cssBevel.strength)} />
                <StyleSlider label="Depth" max={4} min={0} onChange={(depth) => onGrainSettingsChange({ cssBevel: { depth } })} step={0.1} value={grainSettings.cssBevel.depth} valueLabel={pxLabel(grainSettings.cssBevel.depth)} />
                <StyleSlider label="Highlight" max={1} min={0} onChange={(highlight) => onGrainSettingsChange({ cssBevel: { highlight } })} step={0.01} value={grainSettings.cssBevel.highlight} valueLabel={percentLabel(grainSettings.cssBevel.highlight)} />
                <StyleSlider label="Shadow" max={1} min={0} onChange={(shadow) => onGrainSettingsChange({ cssBevel: { shadow } })} step={0.01} value={grainSettings.cssBevel.shadow} valueLabel={percentLabel(grainSettings.cssBevel.shadow)} />
                <StyleSlider label="Text" max={1} min={0} onChange={(text) => onGrainSettingsChange({ cssBevel: { text } })} step={0.01} value={grainSettings.cssBevel.text} valueLabel={percentLabel(grainSettings.cssBevel.text)} />
              </div>
            </PanelSection>
          </div>
          <PanelSection>
            <PanelTitle>Readout</PanelTitle>
            <InfoRows
              rows={[
                ["State", grainSettings.enabled ? "enabled" : "off", grainSettings.enabled ? "text-up" : "text-dim"],
                ["Intensity", percentLabel(grainSettings.opacity)],
                ["Density", grainSettings.frequency.toFixed(2)],
                ["Contrast", `${grainSettings.contrast.toFixed(2)}x`],
                ["Blend", GRAIN_BLEND_OPTIONS.find((option) => option.id === grainSettings.blendMode)?.label ?? grainSettings.blendMode],
                ["Background", percentLabel(grainSettings.softening.background)],
                ["Font", percentLabel(grainSettings.softening.font)],
                ["Borders", percentLabel(grainSettings.softening.borders)],
                ["Icons", percentLabel(grainSettings.softening.icons)],
                ["SVG Normal", grainSettings.svgNormal.enabled ? "enabled" : "off", grainSettings.svgNormal.enabled ? "text-up" : "text-dim"],
                ["SVG Texture", grainSettings.svgNormal.frequency.toFixed(2)],
                ["SVG Depth", grainSettings.svgNormal.depth.toFixed(1)],
                ["SVG Light", `${degreeLabel(grainSettings.svgNormal.azimuth)} / ${degreeLabel(grainSettings.svgNormal.elevation)}`],
                ["CSS Bevel", grainSettings.cssBevel.enabled ? "enabled" : "off", grainSettings.cssBevel.enabled ? "text-up" : "text-dim"],
                ["Bevel Strength", percentLabel(grainSettings.cssBevel.strength)],
                ["Bevel Depth", pxLabel(grainSettings.cssBevel.depth)],
              ]}
            />
          </PanelSection>
        </div>
      </div>
    </>
  );
}
