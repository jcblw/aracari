import { createRegExpSearch, escapeRegExp, getSurroundingChars, joinArrayWith } from "./utils";

export { escapeRegExp } from "./utils";

interface Config {
  textNodeType: number;
  createTextNode?: (text: string) => Node;
}

interface ReplaceOptions {
  at?: string;
  preserveWord?: boolean;
  replacementIndex?: number;
  caseSensitive?: boolean;
}

type Mapping = string[][];

export class Aracari<T extends HTMLElement = HTMLElement> {
  root: T | undefined;
  mapping: string[][];
  config: Config;

  constructor(root: T | Mapping, options: Partial<Config> | undefined = {}) {
    this.config = {
      textNodeType: options.textNodeType || Node.TEXT_NODE,
      createTextNode:
        options.createTextNode || document.createTextNode.bind(document),
    };
    if (Array.isArray(root)) {
      this.mapping = root;
    } else if (typeof root === "object" && root.childNodes) {
      this.root = root;
      this.mapping = this.getTextNodeMapping(root);
    }
  }

  public getText() {
    return this.mapping.map(([text]) => text).join("");
  }

  public getAddressForText(
    text,
    caseSensitive: boolean = true,
    preserveWord: boolean = false
  ): string | null {
    const matchedNode = this.getMappingsForText(
      text,
      caseSensitive,
      preserveWord
    );
    return matchedNode && matchedNode[0] ? matchedNode[0][1] : null;
  }

  public getAddressesForText(
    text,
    caseSensitive: boolean = true,
    preserveWord: boolean = false
  ): string[] | null {
    const matchedNode = this.getMappingsForText(
      text,
      caseSensitive,
      preserveWord
    );
    return matchedNode ? matchedNode.map((node) => node[1]) : null;
  }

  public getTextByAddress(address: string): string | null {
    const node = this.getMappingFromAddress(address);
    return node ? node[0] : null;
  }

  public isInSingleNode(text: string, caseSensitive: boolean = true) {
    return !!this.getAddressForText(text, caseSensitive);
  }

  public getTextNode(text: string, caseSensitive: boolean = true, preserveWord: boolean = false) {
    const address = this.getAddressForText(text, caseSensitive, preserveWord);
    if (!address) return null;
    return this.getNodeByAddress(address);
  }

  public replaceText(
    text: string,
    nodes: T | Node | (T | Node)[],
    options: ReplaceOptions = {}
  ) {
    let node;
    const {
      at,
      preserveWord,
      replacementIndex = 0,
      caseSensitive = true,
    } = options;

    if (at) {
      node = this.getNodeByAddress(at);
    } else {
      node = this.getTextNode(text, caseSensitive, preserveWord);
    }

    const pattern = createRegExpSearch(text, preserveWord ?? true);


    const textMatch = node?.textContent.match(pattern);

    // Handling text around replacement text
    if (!textMatch) {
      throw new Error(`Text "${text}" not found in node in ${node?.textContext ?? "unknown"}`);
    }

    const contents = node.textContent.split(pattern);
    const [preChar, postChar] = getSurroundingChars(textMatch[replacementIndex]);

    const preText = joinArrayWith(contents.slice(0, replacementIndex + 1), ({ nextIndex }) => {
      const [preChar, postChar] = getSurroundingChars(textMatch[nextIndex - 1]);
      return `${preChar}${text}${postChar}`;
    });
    const postText = joinArrayWith(contents.slice(replacementIndex + 1), ({ nextIndex}) => {
      const [preChar, postChar] = getSurroundingChars(textMatch[nextIndex]);
      return `${preChar}${text}${postChar}`;
    });    

    const replacementNodes = [
      this.maybeCreateTextNode(preText + preChar),
      ...(Array.isArray(nodes) ? nodes : [nodes]),
      this.maybeCreateTextNode(postChar + postText),
    ].filter((x) => x);

    // Replace existing text node with new node-list.
    node.replaceWith(...replacementNodes);
    return this;
  }

  public remap(mapping?: Mapping) {
    this.mapping = mapping ?? this.getTextNodeMapping(this.root!);
    return this;
  }

  public getNodeByAddress(address: string) {
    const path = address.split(".").map((i) => parseInt(i, 10));
    return this.walkNodes(this.root, path);
  }

  // Takes a node and path and then will recursively call itself
  // to find the node or return undefined
  public walkNodes(
    parent: T | undefined,
    path: number[]
  ): ChildNode | undefined {
    if (!path.length || !parent) {
      return parent;
    }
    const newPath = [...path];
    const childNth = newPath.shift();
    const child = parent.childNodes[childNth as number] as T | undefined;
    return this.walkNodes(child, newPath);
  }

  private getMappingsForText(
    text: string,
    caseSensitive: boolean = true,
    preserveWord: boolean = false
  ): string[][] {
    const delimiter = preserveWord ? "\\b" : "";
    const pattern = new RegExp(
      `${delimiter}${escapeRegExp(text)}${delimiter}`,
      `${caseSensitive ? "i" : ""}g`
    );
    return this.mapping.filter(([text]) => !!text.match(pattern));
  }

  private getMappingFromAddress(address: string): string[] | undefined {
    return this.mapping.find(([text, nodeAddress]) => nodeAddress === address);
  }

  private maybeCreateTextNode(text: string) {
    const { createTextNode } = this.config;
    if (!text.length) {
      return null;
    }
    return createTextNode?.(text);
  }

  // Builds up a mapping of text and path to location of text node.
  // [['Foo Bar', '23.1.0.0']]
  private getTextNodeMapping(parent: T, path: number[] = []) {
    const { textNodeType } = this.config;
    return Array.from(parent.childNodes).flatMap((node, i) => {
      if (node.nodeType === textNodeType) {
        return [[node.textContent, [...path, i].join(".")]];
      }
      if (typeof node === "object" && node?.childNodes?.length) {
        return this.getTextNodeMapping(node as T, [...path, i]);
      }
      return [];
    });
  }
}
