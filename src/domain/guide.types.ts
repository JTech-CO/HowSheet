/**
 * HowSheet 도메인 타입.
 *
 * 기준: 기술 백서 §2.3.2. 타입과 동결된 상수만 담고 로직은 두지 않는다.
 * 리더 런타임이 import해도 번들이 늘지 않아야 하기 때문이다. (INV-11, §3.4)
 *
 * 런타임 검증은 `guide.schema.ts`가 담당하고, 두 파일은 항상 같은 모양을
 * 표현해야 한다. (INV-03 스키마 단일 기준)
 */

/** 현재 빌드가 편집할 수 있는 스키마 버전. */
export const SCHEMA_VERSION = '1.0';
export type SchemaVersion = typeof SCHEMA_VERSION;

export type ThemePreference = 'system' | 'light' | 'dark';
export type Severity = 'info' | 'warning' | 'danger';
export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'blocked';
export type CompletionMode = 'checkbox' | 'choice' | 'automatic';
export type PrintMode = 'active-path' | 'all-steps';
export type BranchOperator = 'equals' | 'notEquals' | 'checked' | 'notChecked';
export type TroubleshootingScope = 'global' | 'step';

export interface GuideDocument {
  schemaVersion: SchemaVersion;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  meta: GuideMeta;
  preparation: PreparationItem[];
  warnings: WarningBlock[];
  steps: GuideStep[];
  startStepId: string;
  troubleshooting: TroubleshootingItem[];
  completion: CompletionConfig;
  assets: AssetManifestItem[];
  settings: GuideSettings;
}

export interface GuideMeta {
  title: string;
  summary?: string;
  audience?: string;
  author?: string;
  language: string;
  estimatedMinutes?: number;
  tags?: string[];
}

export interface GuideSettings {
  defaultTheme: ThemePreference;
  allowThemeSwitch: boolean;
  allowProgressReset: boolean;
  showOverallOutline: boolean;
  printMode: PrintMode;
}

export interface PreparationItem {
  id: string;
  label: string;
  detail?: string;
  required: boolean;
  link?: SafeLink;
  order: number;
}

export interface WarningBlock {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  requiresAcknowledgement: boolean;
  acknowledgementLabel?: string;
  order: number;
}

export interface GuideStep {
  id: string;
  order: number;
  title: string;
  summary?: string;
  blocks: ContentBlock[];
  successCriteria?: string;
  completionMode: CompletionMode;
  branchRules: BranchRule[];
  defaultNextStepId?: string;
  troubleshootingIds: string[];
  optional: boolean;
}

export type ContentBlock =
  TextBlock | CodeBlock | LinkBlock | ImageBlock | ChecklistBlock | DecisionBlock | DividerBlock;

/** `ContentBlock` 판별자의 전체 목록. 렌더러의 exhaustive 처리를 검증할 때 쓴다. */
export const CONTENT_BLOCK_TYPES = [
  'text',
  'code',
  'link',
  'image',
  'checklist',
  'decision',
  'divider',
] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export interface BaseBlock {
  id: string;
  order: number;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  markdown: string;
}

export interface CodeBlock extends BaseBlock {
  type: 'code';
  language?: string;
  code: string;
  copyLabel?: string;
}

export interface LinkBlock extends BaseBlock {
  type: 'link';
  label: string;
  url: string;
  description?: string;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  assetId: string;
  alt: string;
  caption?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export interface ChecklistBlock extends BaseBlock {
  type: 'checklist';
  items: ChecklistItem[];
}

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
}

export interface DecisionBlock extends BaseBlock {
  type: 'decision';
  question: string;
  options: DecisionOption[];
  required: boolean;
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
}

export interface BranchRule {
  id: string;
  sourceBlockId?: string;
  operator: BranchOperator;
  value?: string | boolean;
  targetStepId: string;
  priority: number;
}

export interface TroubleshootingItem {
  id: string;
  scope: TroubleshootingScope;
  stepId?: string;
  symptom: string;
  likelyCause?: string;
  resolution: ContentBlock[];
  order: number;
}

export interface CompletionConfig {
  title: string;
  message: string;
  showSummary: boolean;
  primaryAction?: SafeLink;
  secondaryAction?: SafeLink;
}

export interface SafeLink {
  label: string;
  url: string;
}

export interface AssetManifestItem {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  checksum: string;
}

// ────────────────────────────────────────────────────── 필드 제약 (기술 §2.2.4)

/** 검증 한계값. 스키마와 UI 글자 수 표시가 같은 값을 참조한다. */
export const FIELD_LIMITS = {
  titleMin: 1,
  titleMax: 120,
  audienceMax: 200,
  stepTitleMin: 1,
  stepTitleMax: 100,
  textBlockMax: 20_000,
  imageBytesMax: 5 * 1024 * 1024,
} as const;

/** 허용 링크 프로토콜. 목록과 판정은 domain이 단독으로 소유한다. (§3.3) */
export const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'] as const;

/** 허용 이미지 MIME. SVG는 MVP에서 차단한다. (기술 §7.1-8) */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
