/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from '@kbn/core/server';
import {
  ExternalServiceCredentials,
  Incident,
  PartialIncident,
  ResponseError,
  ServiceNowError,
  ServiceNowPublicConfigurationType,
  ServiceNowSecretConfigurationType,
} from './types';
import { FIELD_PREFIX } from './config';
import { addTimeZoneToDate, getErrorMessage } from '../lib/axios_utils';
import * as i18n from './translations';
import { ActionsConfigurationUtilities } from '../../actions_config';
import { ConnectorTokenClientContract } from '../../types';
import { getOAuthJwtAccessToken } from '../lib/get_oauth_jwt_access_token';

export const prepareIncident = (useOldApi: boolean, incident: PartialIncident): PartialIncident =>
  useOldApi
    ? incident
    : Object.entries(incident).reduce(
        (acc, [key, value]) => ({ ...acc, [`${FIELD_PREFIX}${key}`]: value }),
        {} as Incident
      );

const createErrorMessage = (errorResponse?: ServiceNowError): string => {
  if (errorResponse == null) {
    return 'unknown: errorResponse was null';
  }

  const { error } = errorResponse;
  return error != null
    ? `${error?.message}: ${error?.detail}`
    : 'unknown: no error in error response';
};

export const createServiceError = (error: ResponseError, message: string) =>
  new Error(
    getErrorMessage(
      i18n.SERVICENOW,
      `${message}. Error: ${error.message} Reason: ${createErrorMessage(error.response?.data)}`
    )
  );

export const getPushedDate = (timestamp?: string) => {
  if (timestamp != null) {
    return new Date(addTimeZoneToDate(timestamp)).toISOString();
  }

  return new Date().toISOString();
};

export const throwIfSubActionIsNotSupported = ({
  api,
  subAction,
  supportedSubActions,
  logger,
}: {
  api: Record<string, unknown>;
  subAction: string;
  supportedSubActions: string[];
  logger: Logger;
}) => {
  if (!api[subAction]) {
    const errorMessage = `[Action][ExternalService] Unsupported subAction type ${subAction}.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  if (!supportedSubActions.includes(subAction)) {
    const errorMessage = `[Action][ExternalService] subAction ${subAction} not implemented.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
};

export interface GetAxiosInstanceOpts {
  connectorId?: string;
  logger: Logger;
  configurationUtilities: ActionsConfigurationUtilities;
  credentials: ExternalServiceCredentials;
  snServiceUrl: string;
  connectorTokenClient?: ConnectorTokenClientContract;
}

export const getAxiosInstance = ({
  connectorId,
  logger,
  configurationUtilities,
  credentials,
  snServiceUrl,
  connectorTokenClient,
}: GetAxiosInstanceOpts): AxiosInstance => {
  const { config, secrets } = credentials;
  const { isOAuth } = config as ServiceNowPublicConfigurationType;
  const { username, password } = secrets as ServiceNowSecretConfigurationType;

  let axiosInstance;

  if (!isOAuth && username && password) {
    axiosInstance = axios.create({
      auth: { username, password },
    });
  } else {
    axiosInstance = axios.create();
    axiosInstance.interceptors.request.use(
      async (axiosConfig: AxiosRequestConfig) => {
        const accessToken = await getOAuthJwtAccessToken({
          connectorId,
          logger,
          configurationUtilities,
          credentials: {
            config: {
              clientId: config.clientId as string,
              jwtKeyId: config.jwtKeyId as string,
              userIdentifierValue: config.userIdentifierValue as string,
            },
            secrets: {
              clientSecret: secrets.clientSecret as string,
              privateKey: secrets.privateKey as string,
              privateKeyPassword: secrets.privateKeyPassword
                ? (secrets.privateKeyPassword as string)
                : null,
            },
          },
          tokenUrl: `${snServiceUrl}/oauth_token.do`,
          connectorTokenClient,
        });

        if (accessToken) {
          axiosConfig.headers = { ...axiosConfig.headers, Authorization: accessToken };
        }

        return axiosConfig;
      },
      (error) => {
        Promise.reject(error);
      }
    );
  }

  return axiosInstance;
};
