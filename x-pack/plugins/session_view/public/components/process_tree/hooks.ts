/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import memoizeOne from 'memoize-one';
import { useState, useEffect } from 'react';
import {
  AlertStatusEventEntityIdMap,
  EventAction,
  EventKind,
  Process,
  ProcessEvent,
  ProcessMap,
  ProcessEventsPage,
} from '../../../common/types/process_tree';
import {
  updateAlertEventStatus,
  processNewEvents,
  searchProcessTree,
  autoExpandProcessTree,
  updateProcessMap,
} from './helpers';
import { sortProcesses } from '../../../common/utils/sort_processes';

interface UseProcessTreeDeps {
  sessionEntityId: string;
  data: ProcessEventsPage[];
  alerts: ProcessEvent[];
  searchQuery?: string;
  updatedAlertsStatus: AlertStatusEventEntityIdMap;
  verboseMode: boolean;
  jumpToEntityId?: string;
}

export class ProcessImpl implements Process {
  id: string;
  events: ProcessEvent[];
  alerts: ProcessEvent[];
  children: Process[];
  parent: Process | undefined;
  autoExpand: boolean;
  searchMatched: string | null;
  orphans: Process[];

  constructor(id: string) {
    this.id = id;
    this.events = [];
    this.alerts = [];
    this.children = [];
    this.orphans = [];
    this.autoExpand = false;
    this.searchMatched = null;
  }

  addEvent(newEvent: ProcessEvent) {
    // rather than push new events on the array, we return a new one
    // this helps the below memoizeOne functions to behave correctly.
    const exists = this.events.find((event) => {
      return event.event?.id === newEvent.event?.id;
    });

    if (!exists) {
      this.events = this.events.concat(newEvent);
    }
  }

  addAlert(alert: ProcessEvent) {
    this.alerts = this.alerts.concat(alert);
  }

  clearSearch() {
    this.searchMatched = null;
  }

  getChildren(verboseMode: boolean) {
    let children = this.children;

    // if there are orphans, we just render them inline with the other child processes (currently only session leader does this)
    if (this.orphans.length) {
      children = [...children, ...this.orphans];
    }
    // When verboseMode is false, we filter out noise via a few techniques.
    // This option is driven by the "verbose mode" toggle in SessionView/index.tsx
    if (!verboseMode) {
      children = children.filter((child) => {
        if (child.events.length === 0) {
          return false;
        }

        // processes with alerts will never be filtered out
        if (child.autoExpand || child.hasAlerts()) {
          return true;
        }

        if (child.isVerbose()) {
          return false;
        }

        return true;
      });
    }

    return children.sort(sortProcesses);
  }

  isVerbose() {
    const {
      group_leader: groupLeader,
      session_leader: sessionLeader,
      entry_leader: entryLeader,
    } = this.getDetails().process ?? {};

    // Processes that have their session leader as their process group leader are considered "verbose"
    // This accounts for a lot of noise from bash and other shells forking, running auto completion processes and
    // other shell startup activities (e.g bashrc .profile etc)
    if (
      this.id !== entryLeader?.entity_id &&
      (!groupLeader || !sessionLeader || groupLeader.pid === sessionLeader.pid)
    ) {
      return true;
    }

    return false;
  }

  hasOutput() {
    return !!this.findEventByAction(this.events, EventAction.output);
  }

  hasAlerts() {
    return !!this.alerts.length;
  }

  hasAlert(alertUuid: string | undefined) {
    if (!alertUuid) {
      return false;
    }

    return !!this.alerts.find((event) => event.kibana?.alert?.uuid === alertUuid);
  }

  getAlerts() {
    return this.alerts;
  }

  updateAlertsStatus(updatedAlertsStatus: AlertStatusEventEntityIdMap) {
    this.alerts = updateAlertEventStatus(this.alerts, updatedAlertsStatus);
  }

  hasExec() {
    return !!this.findEventByAction(this.events, EventAction.exec);
  }

  hasExited() {
    return !!this.findEventByAction(this.events, EventAction.end);
  }

  getDetails() {
    return this.getDetailsMemo(this.events);
  }

  getOutput() {
    // not implemented, output ECS schema not defined (for a future release)
    return '';
  }

  getEndTime() {
    const endEvent = this.findEventByAction(this.events, EventAction.end);
    return endEvent?.['@timestamp'] || '';
  }

  // isUserEntered is a best guess at which processes were initiated by a real person
  // In most situations a user entered command in a shell such as bash, will cause bash
  // to fork, create a new process group, and exec the command (e.g ls). If the session
  // has a controlling tty (aka an interactive session), we assume process group leaders
  // with a session leader for a parent are "user entered".
  // Because of the presence of false positives in this calculation, it is currently
  // only used to auto expand parts of the tree that could be of interest.
  isUserEntered() {
    const event = this.getDetails();

    if (!event) {
      return false;
    }

    const {
      pid,
      tty,
      parent,
      session_leader: sessionLeader,
      group_leader: groupLeader,
    } = event.process ?? {};

    const parentIsASessionLeader = parent && sessionLeader && parent.pid === sessionLeader.pid;
    const processIsAGroupLeader = groupLeader && pid === groupLeader.pid;
    const sessionIsInteractive = !!tty;

    return !!(sessionIsInteractive && parentIsASessionLeader && processIsAGroupLeader);
  }

  getMaxAlertLevel() {
    // TODO: as part of alerts details work + tie in with the new alert flyout
    return null;
  }

  findEventByAction = memoizeOne((events: ProcessEvent[], action: EventAction) => {
    return events.find(({ event }) => event?.action === action);
  });

  findEventByKind = memoizeOne((events: ProcessEvent[], kind: EventKind) => {
    return events.find(({ event }) => event?.kind === kind);
  });

  filterEventsByAction = memoizeOne((events: ProcessEvent[], action: EventAction) => {
    return events.filter(({ event }) => event?.action === action);
  });

  filterEventsByKind = memoizeOne((events: ProcessEvent[], kind: EventKind) => {
    return events.filter(({ event }) => event?.kind === kind);
  });

  // returns the most recent fork, exec, or end event
  // to be used as a source for the most up to date details
  // on the processes lifecycle.
  getDetailsMemo = memoizeOne((events: ProcessEvent[]) => {
    // TODO: add these to generator
    const actionsToFind: Array<EventAction | undefined> = [
      EventAction.fork,
      EventAction.exec,
      EventAction.end,
    ];
    const filtered = events.filter((processEvent) => {
      return actionsToFind.includes(processEvent.event?.action);
    });

    // because events is already ordered by @timestamp we take the last event
    // which could be a fork (w no exec or exit), most recent exec event (there can be multiple), or end event.
    // If a process has an 'end' event will always be returned (since it is last and includes details like exit_code and end time)
    return filtered[filtered.length - 1] ?? {};
  });

  isDescendantOf(process: Process) {
    let parent = this.parent;

    while (parent) {
      if (parent === process) {
        return true;
      }

      parent = parent.parent;
    }

    return false;
  }
}

export const useProcessTree = ({
  sessionEntityId,
  data,
  alerts,
  searchQuery,
  updatedAlertsStatus,
  verboseMode,
  jumpToEntityId,
}: UseProcessTreeDeps) => {
  // initialize map, as well as a placeholder for session leader process
  // we add a fake session leader event, sourced from wide event data.
  // this is because we might not always have a session leader event
  // especially if we are paging in reverse from deep within a large session
  const fakeLeaderEvent = data[0].events?.find?.((event) => event.event?.kind === EventKind.event);
  const sessionLeaderProcess = new ProcessImpl(sessionEntityId);

  if (fakeLeaderEvent) {
    fakeLeaderEvent.user = fakeLeaderEvent?.process?.entry_leader?.user;
    fakeLeaderEvent.group = fakeLeaderEvent?.process?.entry_leader?.group;
    fakeLeaderEvent.process = {
      ...fakeLeaderEvent.process,
      ...fakeLeaderEvent.process?.entry_leader,
      parent: fakeLeaderEvent.process?.parent,
    };
    sessionLeaderProcess.events.push(fakeLeaderEvent);
  }

  const initializedProcessMap: ProcessMap = {
    [sessionEntityId]: sessionLeaderProcess,
  };

  const [processMap, setProcessMap] = useState(initializedProcessMap);
  const [processedPages, setProcessedPages] = useState<ProcessEventsPage[]>([]);
  const [alertsProcessed, setAlertsProcessed] = useState(false);
  const [searchResults, setSearchResults] = useState<Process[]>([]);
  const [orphans, setOrphans] = useState<Process[]>([]);

  useEffect(() => {
    let updatedProcessMap: ProcessMap = processMap;
    let newOrphans: Process[] = orphans;
    const newProcessedPages: ProcessEventsPage[] = [];

    data.forEach((page, i) => {
      const processed = processedPages.find((p) => p.cursor === page.cursor);

      if (!processed) {
        const backwards = i < processedPages.length;

        const result = processNewEvents(
          updatedProcessMap,
          page.events,
          orphans,
          sessionEntityId,
          backwards
        );

        updatedProcessMap = result[0];
        newOrphans = result[1];

        newProcessedPages.push(page);
      }
    });

    if (newProcessedPages.length > 0) {
      setProcessMap({ ...updatedProcessMap });
      setProcessedPages([...processedPages, ...newProcessedPages]);
      setOrphans(newOrphans);
      autoExpandProcessTree(updatedProcessMap, jumpToEntityId);
    }
  }, [data, processMap, orphans, processedPages, sessionEntityId, jumpToEntityId]);

  useEffect(() => {
    // currently we are loading a single page of alerts, with no pagination
    // so we only need to add these alert events to processMap once.
    if (!alertsProcessed) {
      const updatedProcessMap = updateProcessMap(processMap, alerts);
      setProcessMap({ ...updatedProcessMap });
      setAlertsProcessed(true);
    }
  }, [processMap, alerts, alertsProcessed]);

  useEffect(() => {
    setSearchResults(searchProcessTree(processMap, searchQuery, verboseMode));
  }, [searchQuery, processMap, verboseMode]);

  // set new orphans array on the session leader
  const sessionLeader = processMap[sessionEntityId];

  sessionLeader.orphans = orphans;

  // update alert status in processMap for alerts in updatedAlertsStatus
  Object.keys(updatedAlertsStatus).forEach((alertUuid) => {
    const process = processMap[updatedAlertsStatus[alertUuid].processEntityId];
    if (process) {
      process.updateAlertsStatus(updatedAlertsStatus);
    }
  });

  return { sessionLeader: processMap[sessionEntityId], processMap, searchResults };
};
