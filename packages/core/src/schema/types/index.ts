export type SchemaItem = {
  /** 块级节点 */
  block?: boolean;
  /** 行内块节点 */
  inline?: boolean;
  /** 空节点 */
  void?: boolean;
  /** 跟踪 Mark */
  tailMark?: boolean;
};

export type EditorSchema = Record<string, SchemaItem>;
