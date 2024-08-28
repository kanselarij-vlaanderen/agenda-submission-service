import {
  app,
  errorHandler,
  uuid,
} from 'mu';
import { CONCEPTS, URI_BASES } from './constants';
import { getOpenMeetings, getMeetingForSubmission, isMeetingClosed, submitSubmissionOnMeeting } from './lib/meeting';
import { isSubcaseOnAgenda } from './lib/subcase';
import { getRelatedResources } from './lib/data-fetching';
import { persistRecords } from './lib/data-persisting';
import { reorderAgendaitems } from './lib/agendaitem-order';
import { getAgenda, isApprovedAgenda } from './lib/agenda';
import { isLoggedIn } from './lib/session';

const cacheClearTimeout = process.env.CACHE_CLEAR_TIMEOUT || 5000;

const locks = new Set();

function isTruthy(value) {
  return [true, "true"].includes(value);
}

app.get('/', function(_req, res) {
  res.send('The agenda-submission-service is alive!');
});

app.get('/open-meetings', async function(req, res, next) {
  const sessionUri = req.headers['mu-session-id']
  if (!(await isLoggedIn(sessionUri))) {
    return next({ message: 'Unauthorized access to this endpoint is not permitted', status: 401 });
  }
  const openMeetings = await getOpenMeetings();
  return res.status(200).send({
    data: openMeetings.map(
      (meeting) => ({ id: meeting.id, type: 'meetings', attributes: { ...meeting } }))
  });
});

app.get('/submissions/:id/for-meeting', async function(req, res, next) {
  const sessionUri = req.headers['mu-session-id']
  if (!(await isLoggedIn(sessionUri))) {
    return next({ message: 'Unauthorized access to this endpoint is not permitted', status: 401 });
  }
  const submissionId = req.params.id;
  if (!submissionId) {
    return next({ message: 'Path parameter submission ID was not set, cannot proceed', status: 400 });
  }

  const meeting = await getMeetingForSubmission(submissionId);
  return res.status(200).send({
    data: { id: meeting.id, type: 'meetings', attributes: meeting }
  });
});

app.post('/meetings/:id/submit-submission', async function(req, res, next) {
  const submissionUri = req.body.submission;

  if (locks.has(submissionUri)) {
    return next({ message: 'The subcase is currently being submitted, submission process cannot be started now', status: 409 });
  } else {
    locks.add(submissionUri);
  }

  try {
    const meetingId = req.params.id;
    const meetingUri = req.body.meeting;

    if (!meetingId) {
      return next({ message: 'Path parameter meeting ID was not set, cannot proceed', status: 400 });
    }

    if (!meetingUri) {
      return next({ message: 'Body does not contain a "meeting" field, cannot proceed', status: 400 });
    }

    if (!submissionUri) {
      return next({ message: 'Body does not contain a "submission" field, cannot proceed', status: 400 });
    }

    await submitSubmissionOnMeeting(submissionUri, meetingUri);

    // cache issue, submission.meeting is null but data exists, cache reset works
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return res.status(201).send();
  } finally {
    locks.delete(submissionUri);
  }
});

app.post('/meetings/:id/submit', async function(req, res, next) {
  const subcaseUri = req.body.subcase;

  if (locks.has(subcaseUri)) {
    return next({ message: 'The subcase is currently being submitted, submission process cannot be started now', status: 409 });
  } else {
    locks.add(subcaseUri);
  }

  try {
    const meetingId = req.params.id;
    const formallyOk = req.body.formallyOk;
    const privateComment = req.body.privateComment;

    if (!meetingId) {
      return next({ message: 'Path parameter meeting ID was not set, cannot proceed', status: 400 });
    }

    if (!subcaseUri) {
      return next({ message: 'Body does not contain a "subcase" field, cannot proceed', status: 400 });
    }

    if (await isMeetingClosed(meetingId)) {
      return next({ message: 'This meeting is already closed, the provided subcase cannot be submitted to it', status: 400 });
    }

    if (await isSubcaseOnAgenda(subcaseUri)) {
      return next({ message: 'The subcase is already submitted on an agenda and is not postponed, cannot resubmit it', status: 400 });
    }

    const {
      meeting,
      agenda,
      agendaitems,
      subcase,
      submissionActivities,
      signFlows,
    } = await getRelatedResources(meetingId, subcaseUri);

    if (!meeting || !agenda || !subcase) {
      return next({ message: 'The necessary data to put the provided subcase on this meeting could not be found.', status: 404 });
    }

    const submissionsWithoutAnAgenda = submissionActivities.filter((resource) => !resource.agendaActivity);
    const allPieces = [...new Set(submissionActivities.flatMap((resource) => resource.pieces))];
    let newSubmission;

    if (submissionsWithoutAnAgenda.length === 0) {
      // Create a new submissionActivity
      const newSubmissionId = uuid();
      newSubmission = {
        id: newSubmissionId,
        uri: `${URI_BASES.submissionActivity}${newSubmissionId}`,
        startDate: new Date(),
        subcase: subcaseUri,
        pieces: allPieces,
      };
    } else {
      // If all pieces for submission are in submission without an agenda, do nothing
      // Otherwise create a new submission
      const unsubmittedPieces = [...new Set(submissionsWithoutAnAgenda.flatMap((resource) => resource.pieces))];
      const difference = allPieces.filter((piece) => !unsubmittedPieces.includes(piece));

      if (difference.length) {
        const newSubmissionId = uuid();
        newSubmission = {
          id: newSubmissionId,
          uri: `${URI_BASES.submissionActivity}${newSubmissionId}`,
          startDate: new Date(),
          subcase: subcaseUri,
          pieces: difference,
        };
      }
    }

    const agendaActivityId = uuid();
    const agendaActivity = {
      id: agendaActivityId,
      uri: `${URI_BASES.agendaActivity}${agendaActivityId}`,
      startDate: new Date(),
      subcase: subcaseUri,
      submissionActivities: newSubmission
        ? [...submissionsWithoutAnAgenda, newSubmission]
        : submissionsWithoutAnAgenda,
    };

    const decisionActivityId = uuid();
    const decisionActivity = {
      id: decisionActivityId,
      uri: `${URI_BASES.decisionActivity}${decisionActivityId}`,
      startDate: meeting.plannedStart.at(0),
      subcase: subcaseUri,
      secretary: meeting.secretary?.at(0),
      ...(subcase.agendaitemType.at(0) === CONCEPTS.AGENDA_ITEM_TYPES.ANNOUNCEMENT ? { decisionResultCode: CONCEPTS.DECISION_RESULT_CODES.ACKNOWLEDGED } : null)
    };

    const now = new Date();
    const treatmentId = uuid();
    const treatment = {
      id: treatmentId,
      uri: `${URI_BASES.treatment}${treatmentId}`,
      created: now,
      modified: now,
      decisionActivity: decisionActivity.uri,
    };

    const agendaitemNumber = 1 + Math.max(0, ...agendaitems.map((agendaitem) => agendaitem.number.at(0)));
    const agendaitemId = uuid();
    const agendaitem = {
      id: agendaitemId,
      uri: `${URI_BASES.agendaitem}${agendaitemId}`,
      created: new Date(),
      agenda: agenda.uri,
      title: subcase.title?.at(0),
      shortTitle: subcase.shortTitle?.at(0),
      formallyOk: formallyOk ? CONCEPTS.ACCEPTANCE_STATUSES.OK : CONCEPTS.ACCEPTANCE_STATUSES.NOT_YET_OK,
      number: agendaitemNumber,
      agendaitemType: subcase.agendaitemType.at(0),
      mandatees: subcase.mandatees,
      pieces: allPieces,
      linkedPieces: subcase.linkedPieces,
      agendaActivity: agendaActivity.uri,
      treatment: treatment.uri,
      privateComment: privateComment,
    };

    let newsItem;
    if (subcase.agendaitemType.at(0) === CONCEPTS.AGENDA_ITEM_TYPES.ANNOUNCEMENT) {
      const newsItemId = uuid();
      newsItem = {
        id: newsItemId,
        uri: `${URI_BASES.newsItem}${newsItemId}`,
        treatment: treatment.uri,
        title: agendaitem.shortTitle ?? agendaitem.title,
        htmlContent: agendaitem.title,
        finished: true,
        inNewsletter: isTruthy(subcase.confidential?.at(0)) ? false : true,
      };
    }

    await persistRecords({
      agendaitem,
      treatment,
      agendaActivity,
      decisionActivity,
      newSubmission,
      newsItem,
      agenda,
      signFlows,
    });

    if (agendaitem.agendaitemType !== CONCEPTS.AGENDA_ITEM_TYPES.ANNOUNCEMENT) {
      await reorderAgendaitems(agenda.uri, agendaitem.agendaitemType);
    }

    /**
    * Pipe dream: instead of sleeping and responding with one thing, we should
    * tally up all the new records and return them from this call so that the
    * frontend can load them and "know" that they exist, so that we're not at
    * risk of being behind the cache invalidation. This is the way interactions
    * with the resources service work. It's not inherently faster at cache
    * resolution, it just tells the frontend what has been made and the frontend
    * then doesn't try to fetch that data.
    */
    await new Promise((resolve) => setTimeout(resolve, cacheClearTimeout));
    return res.status(200).send({
      data: {
        type: 'agendaitems',
        id: agendaitem.id,
      }
    });
  } finally {
    locks.delete(subcaseUri);
  }
});

app.post('/agendas/:id/reorder', async function (req, res, next) {
  const agendaId = req.params.id;
  if (!agendaId) {
    return next({ message: 'Path parameter agenda ID was not set, cannot proceed', status: 400 });
  }

  if (locks.has(agendaId)) {
    return next({ message: "The agenda's agenda items are currently being reordered, reordering process cannot be started now", status: 409 });
  } else {
    locks.add(agendaId);
  }

  try {
    if (await isApprovedAgenda(agendaId)) {
      return next({ message: 'The agenda is already approved, its agenda items cannot be reordered', status: 400 });
    }

    const agenda = await getAgenda(agendaId);

    await reorderAgendaitems(agenda, CONCEPTS.AGENDA_ITEM_TYPES.NOTA);

    await new Promise((resolve) => setTimeout(resolve, cacheClearTimeout));
    return res.sendStatus(201);
  } finally {
    locks.delete(agendaId);
  }
});

app.use(errorHandler);
