/**
 * Copyright (c) 2020-present, Goldman Sachs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { editor as monacoEditorAPI } from 'monaco-editor';
import type { FileEditorState } from '../../../stores/FileEditorState.js';
import { EDITOR_THEME, useApplicationStore } from '@finos/legend-application';
import {
  clsx,
  Dialog,
  getBaseTextEditorOptions,
  moveCursorToPosition,
  useResizeDetector,
  WordWrapIcon,
} from '@finos/legend-art';
import { useEditorStore } from '../EditorStoreProvider.js';
import {
  getNullableFirstElement,
  getNullableLastElement,
  guaranteeNonNullable,
  returnUndefOnError,
} from '@finos/legend-shared';

const POSITION_PATTERN = /[0-9]+(?::[0-9]+)?/;

const getPositionFromGoToLinePromptInputValue = (
  val: string,
): [number, number | undefined] => {
  const parts = val.split(':');
  if (parts.length < 1 || parts.length > 2) {
    return [1, undefined];
  }
  return [
    returnUndefOnError(() =>
      parseInt(guaranteeNonNullable(getNullableFirstElement(parts))),
    ) ?? 1,
    returnUndefOnError(() =>
      parseInt(guaranteeNonNullable(getNullableLastElement(parts))),
    ),
  ];
};

export const GoToLinePrompt = observer(
  (props: { fileEditorState: FileEditorState }) => {
    const { fileEditorState } = props;
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // validation
    const isValidValue = Boolean(value.match(POSITION_PATTERN));
    const currentEditorCursorPosition =
      fileEditorState.textEditorState.editor?.getPosition();
    const [currentLine, currentColumn] =
      getPositionFromGoToLinePromptInputValue(value);
    const isValidLineNumber =
      1 <= currentLine &&
      currentLine <= fileEditorState.textEditorState.model.getLineCount();
    const error = !isValidValue
      ? 'Invalid value (format [line:column] - e.g. 123:45)'
      : !isValidLineNumber
      ? `Invalid line number`
      : undefined;

    // actions
    const closeModal = (): void => fileEditorState.setShowGoToLinePrompt(false);
    const onValueChange: React.ChangeEventHandler<HTMLInputElement> = (
      event,
    ): void => setValue(event.target.value);
    const create = (
      event: React.FormEvent<HTMLFormElement | HTMLButtonElement>,
    ): void => {
      event.preventDefault();
      closeModal();
      fileEditorState.textEditorState.setForcedCursorPosition({
        lineNumber: currentLine,
        column: currentColumn ?? 1,
      });
    };
    const handleEnter = (): void => inputRef.current?.focus();

    return (
      <Dialog
        open={true}
        onClose={closeModal}
        TransitionProps={{
          onEnter: handleEnter,
        }}
        classes={{ container: 'command-modal__container' }}
        PaperProps={{ classes: { root: 'command-modal__inner-container' } }}
      >
        <div className="modal modal--dark command-modal">
          <div className="modal__title">Go to...</div>
          <div className="command-modal__content">
            <form className="command-modal__content__form" onSubmit={create}>
              <div className="input-group command-modal__content__input">
                <input
                  ref={inputRef}
                  className="input input--dark"
                  onChange={onValueChange}
                  placeholder={
                    currentEditorCursorPosition
                      ? `Current Line: ${
                          currentEditorCursorPosition.lineNumber
                        }, Col: ${
                          currentEditorCursorPosition.column
                        }. Type a line between 1 and ${fileEditorState.textEditorState.model.getLineCount()} to navigate to`
                      : undefined
                  }
                  value={value}
                  spellCheck={false}
                />
                {value !== '' && error && (
                  <div className="input-group__error-message">{error}</div>
                )}
              </div>
            </form>
            <button
              className="command-modal__content__submit-btn btn--dark"
              disabled={value === '' || Boolean(error)}
              onClick={create}
            >
              Go
            </button>
          </div>
        </div>
      </Dialog>
    );
  },
);

export const GenericFileEditor = observer(
  (props: { editorState: FileEditorState }) => {
    const { editorState } = props;
    const editorStore = useEditorStore();
    const applicationStore = useApplicationStore();
    const textInputRef = useRef<HTMLDivElement>(null);
    const [editor, setEditor] = useState<
      monacoEditorAPI.IStandaloneCodeEditor | undefined
    >();
    const content = editorState.file.content;
    const { ref, width, height } = useResizeDetector<HTMLDivElement>();

    useEffect(() => {
      if (!editor && textInputRef.current) {
        const element = textInputRef.current;
        const newEditor = monacoEditorAPI.create(element, {
          ...getBaseTextEditorOptions(),
          theme: EDITOR_THEME.LEGEND,
          wordWrap: editorState.textEditorState.wrapText ? 'on' : 'off',
        });

        newEditor.onDidChangeModelContent(() => {
          const currentVal = newEditor.getValue();
          if (currentVal !== editorState.file.content) {
            // the assertion above is to ensure we don't accidentally clear error on initialization of the editor
            editorState.clearError(); // clear error on content change/typing
          }
          editorState.file.setContent(currentVal);
        });
        // manual trigger to support cursor observability
        newEditor.onDidChangeCursorPosition(() => {
          editorState.textEditorState.notifyCursorObserver();
        });
        newEditor.onDidChangeCursorSelection(() => {
          editorState.textEditorState.notifyCursorObserver();
        });
        // Restore the editor model and view state
        newEditor.setModel(editorState.textEditorState.model);
        if (editorState.textEditorState.viewState) {
          newEditor.restoreViewState(editorState.textEditorState.viewState);
        }
        newEditor.focus(); // focus on the editor initially
        editorState.textEditorState.setEditor(newEditor);
        setEditor(newEditor);
      }
    }, [editorStore, applicationStore, editorState, editor]);

    if (editor) {
      // Set the value of the editor
      const currentValue = editor.getValue();
      if (currentValue !== content) {
        editor.setValue(content);
      }
    }

    useEffect(() => {
      if (width !== undefined && height !== undefined) {
        editor?.layout({ width, height });
      }
    }, [editor, width, height]);

    useEffect(() => {
      if (editor) {
        if (editorState.textEditorState.forcedCursorPosition) {
          moveCursorToPosition(
            editor,
            editorState.textEditorState.forcedCursorPosition,
          );
          editorState.textEditorState.setForcedCursorPosition(undefined);
        }
      }
    }, [editor, editorState, editorState.textEditorState.forcedCursorPosition]);

    // clean up
    useEffect(
      () => (): void => {
        if (editor) {
          // persist editor view state (cursor, scroll, etc.) to restore on re-open
          editorState.textEditorState.setViewState(
            editor.saveViewState() ?? undefined,
          );
          // NOTE: dispose the editor to prevent potential memory-leak
          editor.dispose();
        }
      },
      [editorState, editor],
    );

    return (
      <div className="panel edit-panel file-editor">
        <div className="panel__header file-editor__header">
          <div className="file-editor__header__actions">
            <button
              className={clsx('file-editor__header__action', {
                'file-editor__header__action--active':
                  editorState.textEditorState.wrapText,
              })}
              tabIndex={-1}
              onClick={(): void =>
                editorState.textEditorState.setWrapText(
                  !editorState.textEditorState.wrapText,
                )
              }
              title="Toggle Text Wrap"
            >
              <WordWrapIcon className="file-editor__icon--text-wrap" />
            </button>
            {editorState.showGoToLinePrompt && (
              <GoToLinePrompt fileEditorState={editorState} />
            )}
          </div>
        </div>
        <div className="panel__content file-editor__content">
          <div ref={ref} className="text-editor__container">
            <div className="text-editor__body" ref={textInputRef} />
          </div>
        </div>
      </div>
    );
  },
);