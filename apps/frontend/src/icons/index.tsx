import type { CSSProperties, HTMLAttributes } from "react";

import activitySvg from "./assets/activity.svg?raw";
import alertTriangleSvg from "./assets/alert-triangle.svg?raw";
import arrowRightSvg from "./assets/arrow-right.svg?raw";
import archiveSvg from "./assets/archive.svg?raw";
import banSvg from "./assets/ban.svg?raw";
import botSvg from "./assets/bot.svg?raw";
import checkSvg from "./assets/check.svg?raw";
import chevronDownSvg from "./assets/chevron-down.svg?raw";
import chevronLeftSvg from "./assets/chevron-left.svg?raw";
import chevronRightSvg from "./assets/chevron-right.svg?raw";
import clipboardCheckSvg from "./assets/clipboard-check.svg?raw";
import copySvg from "./assets/copy.svg?raw";
import databaseSvg from "./assets/database.svg?raw";
import downloadSvg from "./assets/download.svg?raw";
import externalLinkSvg from "./assets/external-link.svg?raw";
import folderTreeSvg from "./assets/folder-tree.svg?raw";
import gitBranchSvg from "./assets/git-branch.svg?raw";
import gitPullRequestSvg from "./assets/git-pull-request.svg?raw";
import hammerSvg from "./assets/hammer.svg?raw";
import homeSvg from "./assets/home.svg?raw";
import link2Svg from "./assets/link-2.svg?raw";
import listTreeSvg from "./assets/list-tree.svg?raw";
import paletteSvg from "./assets/palette.svg?raw";
import pencilSvg from "./assets/pencil.svg?raw";
import playSvg from "./assets/play.svg?raw";
import plusSvg from "./assets/plus.svg?raw";
import refreshCwSvg from "./assets/refresh-cw.svg?raw";
import rotateCcwSvg from "./assets/rotate-ccw.svg?raw";
import saveSvg from "./assets/save.svg?raw";
import settingsSvg from "./assets/settings.svg?raw";
import shieldCheckSvg from "./assets/shield-check.svg?raw";
import wrenchSvg from "./assets/wrench.svg?raw";
import xSvg from "./assets/x.svg?raw";

export type IconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  absoluteStrokeWidth?: boolean;
  color?: string;
  size?: number | string;
  strokeWidth?: number | string;
};

function prepareSvg(svg: string): string {
  return svg
    .replace(/\swidth="24(?:px)?"/, ' width="100%"')
    .replace(/\sheight="24(?:px)?"/, ' height="100%"')
    .replace(/stroke="(?:black|#000000|#000)"/g, 'stroke="currentColor"')
    .replace(/fill="(?:black|#000000|#000)"/g, 'fill="currentColor"');
}

function createIcon(svg: string, displayName: string) {
  const markup = prepareSvg(svg);

  function NucleoIcon({
    absoluteStrokeWidth: _absoluteStrokeWidth,
    className,
    color,
    size = 24,
    strokeWidth: _strokeWidth,
    style,
    ...props
  }: IconProps) {
    const dimension = typeof size === "number" ? `${size}px` : size;
    const iconStyle: CSSProperties = {
      color,
      display: "inline-block",
      flexShrink: 0,
      height: dimension,
      lineHeight: 0,
      verticalAlign: "-0.125em",
      width: dimension,
      ...style,
    };
    const iconClassName = ["app-icon", className].filter(Boolean).join(" ");

    return <span aria-hidden="true" {...props} className={iconClassName} dangerouslySetInnerHTML={{ __html: markup }} style={iconStyle} />;
  }

  NucleoIcon.displayName = displayName;
  return NucleoIcon;
}

export const Activity = createIcon(activitySvg, "Activity");
export const AlertTriangle = createIcon(alertTriangleSvg, "AlertTriangle");
export const ArrowRight = createIcon(arrowRightSvg, "ArrowRight");
export const Archive = createIcon(archiveSvg, "Archive");
export const Ban = createIcon(banSvg, "Ban");
export const Bot = createIcon(botSvg, "Bot");
export const Check = createIcon(checkSvg, "Check");
export const ChevronDown = createIcon(chevronDownSvg, "ChevronDown");
export const ChevronLeft = createIcon(chevronLeftSvg, "ChevronLeft");
export const ChevronRight = createIcon(chevronRightSvg, "ChevronRight");
export const ClipboardCheck = createIcon(clipboardCheckSvg, "ClipboardCheck");
export const Copy = createIcon(copySvg, "Copy");
export const Database = createIcon(databaseSvg, "Database");
export const Download = createIcon(downloadSvg, "Download");
export const ExternalLink = createIcon(externalLinkSvg, "ExternalLink");
export const FolderTree = createIcon(folderTreeSvg, "FolderTree");
export const GitBranch = createIcon(gitBranchSvg, "GitBranch");
export const GitPullRequest = createIcon(gitPullRequestSvg, "GitPullRequest");
export const Hammer = createIcon(hammerSvg, "Hammer");
export const Home = createIcon(homeSvg, "Home");
export const Link2 = createIcon(link2Svg, "Link2");
export const ListTree = createIcon(listTreeSvg, "ListTree");
export const Palette = createIcon(paletteSvg, "Palette");
export const Pencil = createIcon(pencilSvg, "Pencil");
export const Play = createIcon(playSvg, "Play");
export const Plus = createIcon(plusSvg, "Plus");
export const RefreshCw = createIcon(refreshCwSvg, "RefreshCw");
export const RotateCcw = createIcon(rotateCcwSvg, "RotateCcw");
export const Save = createIcon(saveSvg, "Save");
export const Settings = createIcon(settingsSvg, "Settings");
export const ShieldCheck = createIcon(shieldCheckSvg, "ShieldCheck");
export const Wrench = createIcon(wrenchSvg, "Wrench");
export const X = createIcon(xSvg, "X");
