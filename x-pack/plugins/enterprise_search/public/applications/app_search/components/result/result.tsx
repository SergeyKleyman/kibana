/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useMemo } from 'react';
import { DraggableProvidedDragHandleProps } from 'react-beautiful-dnd';

import './result.scss';

import { EuiButtonIcon, EuiPanel, EuiFlexGroup, EuiFlexItem, EuiIcon } from '@elastic/eui';

import { i18n } from '@kbn/i18n';

import { ReactRouterHelper } from '../../../shared/react_router_helpers/eui_components';

import { Schema } from '../../../shared/types';

import { ENGINE_DOCUMENT_DETAIL_PATH } from '../../routes';
import { generateEncodedPath } from '../../utils/encode_path_params';

import { ResultField } from './result_field';
import { ResultHeader } from './result_header';
import { FieldValue, Result as ResultType, ResultAction } from './types';

interface Props {
  result: ResultType;
  isMetaEngine: boolean;
  showScore?: boolean;
  shouldLinkToDetailPage?: boolean;
  schemaForTypeHighlights?: Schema;
  actions?: ResultAction[];
  dragHandleProps?: DraggableProvidedDragHandleProps;
}

const RESULT_CUTOFF = 5;

export const Result: React.FC<Props> = ({
  result,
  isMetaEngine,
  showScore = false,
  shouldLinkToDetailPage = false,
  schemaForTypeHighlights,
  actions = [],
  dragHandleProps,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const ID = 'id';
  const META = '_meta';
  const resultMeta = result[META];
  const resultFields = useMemo(
    () => Object.entries(result).filter(([key]) => key !== META && key !== ID),
    [result]
  );
  const numResults = resultFields.length;
  const documentLink = generateEncodedPath(ENGINE_DOCUMENT_DETAIL_PATH, {
    engineName: resultMeta.engine,
    documentId: resultMeta.id,
  });

  const typeForField = (fieldName: string) => {
    if (schemaForTypeHighlights) return schemaForTypeHighlights[fieldName];
  };

  const ResultActions = () => {
    if (!shouldLinkToDetailPage && !actions.length) return null;
    return (
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s">
          {shouldLinkToDetailPage && (
            <ReactRouterHelper to={documentLink}>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  iconType="eye"
                  data-test-subj="DocumentDetailLink"
                  aria-label={i18n.translate(
                    'xpack.enterpriseSearch.appSearch.result.documentDetailLink',
                    { defaultMessage: 'Visit document details' }
                  )}
                />
              </EuiFlexItem>
            </ReactRouterHelper>
          )}
          {actions.map(({ onClick, title, iconType, iconColor }) => (
            <EuiFlexItem key={title}>
              <EuiButtonIcon
                iconType={iconType}
                onClick={onClick}
                color={iconColor ? iconColor : 'primary'}
                aria-label={title}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </EuiFlexItem>
    );
  };

  return (
    <EuiPanel
      paddingSize="none"
      hasShadow={false}
      className="appSearchResult"
      data-test-subj="AppSearchResult"
      title={i18n.translate('xpack.enterpriseSearch.appSearch.result.title', {
        defaultMessage: 'Document {id}',
        values: { id: result[ID].raw },
      })}
    >
      {dragHandleProps && (
        <div {...dragHandleProps} className="appSearchResult__dragHandle">
          <EuiIcon type="grab" />
        </div>
      )}
      <article className="appSearchResult__content">
        <ResultHeader
          resultMeta={resultMeta}
          showScore={!!showScore}
          isMetaEngine={isMetaEngine}
          shouldLinkToDetailPage={shouldLinkToDetailPage}
          actions={<ResultActions />}
        />
        {resultFields
          .slice(0, isOpen ? resultFields.length : RESULT_CUTOFF)
          .map(([field, value]: [string, FieldValue]) => (
            <ResultField
              key={field}
              field={field}
              raw={value.raw}
              snippet={value.snippet}
              type={typeForField(field)}
            />
          ))}
      </article>
      {numResults > RESULT_CUTOFF && (
        <button
          type="button"
          className="appSearchResult__hiddenFieldsToggle"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen
            ? i18n.translate('xpack.enterpriseSearch.appSearch.result.hideAdditionalFields', {
                defaultMessage: 'Hide additional fields',
              })
            : i18n.translate('xpack.enterpriseSearch.appSearch.result.showAdditionalFields', {
                defaultMessage:
                  'Show {numberOfAdditionalFields, number} additional {numberOfAdditionalFields, plural, one {field} other {fields}}',
                values: {
                  numberOfAdditionalFields: numResults - RESULT_CUTOFF,
                },
              })}
          <EuiIcon
            type={isOpen ? 'arrowUp' : 'arrowDown'}
            data-test-subj={isOpen ? 'CollapseResult' : 'ExpandResult'}
          />
        </button>
      )}
    </EuiPanel>
  );
};
