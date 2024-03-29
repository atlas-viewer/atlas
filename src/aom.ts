export interface AtlasObjectModel<Props, SupportedChildElements> {
  applyProps(props: Props): void;

  appendChild(item: SupportedChildElements): void;
  removeChild(item: SupportedChildElements): void;
  insertBefore(item: SupportedChildElements, before: SupportedChildElements): void;
  hideInstance(): void;
}
