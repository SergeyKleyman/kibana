/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import uuid from 'uuid';
import type { ElasticsearchClient } from '@kbn/core/server';

import type {
  Agent,
  AgentAction,
  NewAgentAction,
  FleetServerAgentAction,
} from '../../../common/types/models';
import { AGENT_ACTIONS_INDEX } from '../../../common/constants';

const ONE_MONTH_IN_MS = 2592000000;

export async function createAgentAction(
  esClient: ElasticsearchClient,
  newAgentAction: NewAgentAction
): Promise<AgentAction> {
  const id = newAgentAction.id ?? uuid.v4();
  const timestamp = new Date().toISOString();
  const body: FleetServerAgentAction = {
    '@timestamp': timestamp,
    expiration: newAgentAction.expiration ?? new Date(Date.now() + ONE_MONTH_IN_MS).toISOString(),
    agents: newAgentAction.agents,
    action_id: id,
    data: newAgentAction.data,
    type: newAgentAction.type,
    start_time: newAgentAction.start_time,
    minimum_execution_duration: newAgentAction.minimum_execution_duration,
  };

  await esClient.create({
    index: AGENT_ACTIONS_INDEX,
    id,
    body,
    refresh: 'wait_for',
  });

  return {
    id,
    ...newAgentAction,
    created_at: timestamp,
  };
}

export async function bulkCreateAgentActions(
  esClient: ElasticsearchClient,
  newAgentActions: NewAgentAction[]
): Promise<AgentAction[]> {
  const actions = newAgentActions.map((newAgentAction) => {
    const id = newAgentAction.id ?? uuid.v4();
    return {
      id,
      ...newAgentAction,
    } as AgentAction;
  });

  if (actions.length === 0) {
    return [];
  }

  await esClient.bulk({
    index: AGENT_ACTIONS_INDEX,
    body: actions.flatMap((action) => {
      const body: FleetServerAgentAction = {
        '@timestamp': new Date().toISOString(),
        expiration: action.expiration ?? new Date(Date.now() + ONE_MONTH_IN_MS).toISOString(),
        start_time: action.start_time,
        minimum_execution_duration: action.minimum_execution_duration,
        agents: action.agents,
        action_id: action.id,
        data: action.data,
        type: action.type,
      };

      return [
        {
          create: {
            _id: action.id,
          },
        },
        body,
      ];
    }),
  });

  return actions;
}

export interface ActionsService {
  getAgent: (esClient: ElasticsearchClient, agentId: string) => Promise<Agent>;

  createAgentAction: (
    esClient: ElasticsearchClient,
    newAgentAction: Omit<AgentAction, 'id'>
  ) => Promise<AgentAction>;
}
