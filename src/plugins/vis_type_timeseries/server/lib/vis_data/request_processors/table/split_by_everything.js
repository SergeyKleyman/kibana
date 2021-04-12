/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { overwrite } from '../../helpers';
import { esQuery } from '../../../../../../data/server';

export function splitByEverything(req, panel, esQueryConfig, seriesIndex) {
  return (next) => (doc) => {
    panel.series
      .filter((c) => !(c.aggregate_by && c.aggregate_function))
      .forEach((column) => {
        if (column.filter) {
          overwrite(
            doc,
            `aggs.pivot.aggs.${column.id}.filter`,
            esQuery.buildEsQuery(seriesIndex.indexPattern, [column.filter], [], esQueryConfig)
          );
        } else {
          overwrite(doc, `aggs.pivot.aggs.${column.id}.filter.match_all`, {});
        }
      });
    return next(doc);
  };
}
