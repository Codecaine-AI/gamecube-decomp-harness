export type LocatorKind = "discord" | "pr" | "wiki" | "attempt" | "code";

export interface DiscordLocator {
	kind: "discord";
	messageId: string;
}

export interface PullRequestLocator {
	kind: "pr";
	pullRequestId: string;
  commentNumber?: number;
}

export interface WikiLocator {
	kind: "wiki";
	sectionId: string;
}

export interface AttemptLocator {
	kind: "attempt";
	runId: string;
  submissionSequence?: number;
  transcriptSpan?: string;
}

export interface CodeLocator {
	kind: "code";
	revision: string;
	path: string;
	startLine: number;
	endLine: number;
}

export type Locator =
	| DiscordLocator
	| PullRequestLocator
	| WikiLocator
	| AttemptLocator
	| CodeLocator;

const SEGMENT = "[^\\s/?#]+";
const DECIMAL = "(?:0|[1-9]\\d*)";
const POSITIVE_DECIMAL = "[1-9]\\d*";

const DISCORD_PATTERN = new RegExp(`^discord://message/(${SEGMENT})$`, "u");
const PR_PATTERN = new RegExp(
	`^pr://(${SEGMENT})(?:/comment/(${DECIMAL}))?$`,
	"u",
);
const WIKI_PATTERN = new RegExp(`^wiki://(${SEGMENT})$`, "u");
const ATTEMPT_PATTERN = new RegExp(
	`^attempt://run/(${SEGMENT})(?:/submission/(${DECIMAL}))?(?:/transcript/(${SEGMENT}))?$`,
	"u",
);
const CODE_PATTERN = new RegExp(
	`^code://(${SEGMENT})/([^\\s?#]+)#L(${POSITIVE_DECIMAL})-L(${POSITIVE_DECIMAL})$`,
	"u",
);

export class LocatorParseError extends TypeError {
	constructor(locator: string, expectedKind?: LocatorKind) {
		super(
			expectedKind === undefined
				? `Malformed locator: ${locator}`
				: `Malformed ${expectedKind} locator: ${locator}`,
		);
		this.name = "LocatorParseError";
	}
}

function parseDecimal(value: string): number | undefined {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function assertSegment(value: string, field: string): void {
	if (!new RegExp(`^${SEGMENT}$`, "u").test(value)) {
		throw new TypeError(`${field} is not a valid locator segment`);
	}
}

function assertDecimal(value: number, field: string, positive = false): void {
	if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
		throw new TypeError(`${field} must be a ${positive ? "positive " : ""}safe integer`);
	}
}

export function parseLocator(locator: string, expectedKind?: LocatorKind): Locator {
	let parsed: Locator | undefined;
	let match: RegExpExecArray | null;

	if ((match = DISCORD_PATTERN.exec(locator)) !== null) {
		parsed = { kind: "discord", messageId: match[1] };
	} else if ((match = PR_PATTERN.exec(locator)) !== null) {
		const commentNumber = match[2] === undefined ? undefined : parseDecimal(match[2]);
		if (match[2] === undefined || commentNumber !== undefined) {
			parsed = { kind: "pr", pullRequestId: match[1], commentNumber };
		}
	} else if ((match = WIKI_PATTERN.exec(locator)) !== null) {
		parsed = { kind: "wiki", sectionId: match[1] };
	} else if ((match = ATTEMPT_PATTERN.exec(locator)) !== null) {
		const submissionSequence =
			match[2] === undefined ? undefined : parseDecimal(match[2]);
		if (match[2] === undefined || submissionSequence !== undefined) {
			parsed = {
				kind: "attempt",
				runId: match[1],
				submissionSequence,
				transcriptSpan: match[3],
			};
		}
	} else if ((match = CODE_PATTERN.exec(locator)) !== null) {
		const startLine = parseDecimal(match[3]);
		const endLine = parseDecimal(match[4]);
		if (startLine !== undefined && endLine !== undefined) {
			parsed = {
				kind: "code",
				revision: match[1],
				path: match[2],
				startLine,
				endLine,
			};
		}
	}

	if (parsed === undefined || (expectedKind !== undefined && parsed.kind !== expectedKind)) {
		throw new LocatorParseError(locator, expectedKind);
	}

	return parsed;
}

export function formatLocator(locator: Locator): string {
	switch (locator.kind) {
		case "discord":
			assertSegment(locator.messageId, "messageId");
			return `discord://message/${locator.messageId}`;
		case "pr":
			assertSegment(locator.pullRequestId, "pullRequestId");
			if (locator.commentNumber === undefined) {
				return `pr://${locator.pullRequestId}`;
			}
			assertDecimal(locator.commentNumber, "commentNumber");
			return `pr://${locator.pullRequestId}/comment/${locator.commentNumber}`;
		case "wiki":
			assertSegment(locator.sectionId, "sectionId");
			return `wiki://${locator.sectionId}`;
		case "attempt": {
			assertSegment(locator.runId, "runId");
			let formatted = `attempt://run/${locator.runId}`;
			if (locator.submissionSequence !== undefined) {
				assertDecimal(locator.submissionSequence, "submissionSequence");
				formatted += `/submission/${locator.submissionSequence}`;
			}
			if (locator.transcriptSpan !== undefined) {
				assertSegment(locator.transcriptSpan, "transcriptSpan");
				formatted += `/transcript/${locator.transcriptSpan}`;
			}
			return formatted;
		}
		case "code":
			assertSegment(locator.revision, "revision");
			if (!/^[^\s?#]+$/u.test(locator.path)) {
				throw new TypeError("path is not a valid locator path");
			}
			assertDecimal(locator.startLine, "startLine", true);
			assertDecimal(locator.endLine, "endLine", true);
			return `code://${locator.revision}/${locator.path}#L${locator.startLine}-L${locator.endLine}`;
	}
}
