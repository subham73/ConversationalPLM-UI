"use client";
import { defaultMarkdownParser, defaultMarkdownSerializer } from "prosemirror-markdown";
import { DOMParser, type Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { renderToString } from "react-dom/server";
import { Response } from "@/components/elements/response";

import { documentSchema } from "./config";
import { createSuggestionWidget, type UISuggestion } from "./suggestions";

// ############ old way ##################
// export const buildDocumentFromContent = (content: string) => {
//   const parser = DOMParser.fromSchema(documentSchema);
//   const stringFromMarkdown = renderToString(<Response>{content}</Response>);
//   const tempContainer = document.createElement("div");
//   tempContainer.innerHTML = stringFromMarkdown;
//   return parser.parse(tempContainer);
// };
// ####################################
export const buildDocumentFromContent = (content: string) => {
  return defaultMarkdownParser.parse(content);
};
// ####### mew way to map #############
// const esc = (s: string) =>
//   s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// export const buildDocumentFromContent = (content: string) => {
  // const parser = DOMParser.fromSchema(documentSchema);
  // // Minimal HTML: blank lines → <p>, single newlines → <br/>
  // const html = esc(content)
  //   .split(/\n{2,}/)
  //   .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
  //   .join('') || '<p></p>';

  // const tempContainer = document.createElement('div');
  // tempContainer.innerHTML = html;
  // return parser.parse(tempContainer);
// };
// ####################################



export const buildContentFromDocument = (document: Node) => {
  return defaultMarkdownSerializer.serialize(document);
};

export const createDecorations = (
  suggestions: UISuggestion[],
  view: EditorView
) => {
  const decorations: Decoration[] = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: "suggestion-highlight",
        },
        {
          suggestionId: suggestion.id,
          type: "highlight",
        }
      )
    );

    decorations.push(
      Decoration.widget(
        suggestion.selectionStart,
        (currentView) => {
          const { dom } = createSuggestionWidget(suggestion, currentView);
          return dom;
        },
        {
          suggestionId: suggestion.id,
          type: "widget",
        }
      )
    );
  }

  return DecorationSet.create(view.state.doc, decorations);
};
