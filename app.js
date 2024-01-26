import {
  app,
  errorHandler,
  query,
  update,
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeInt,
  sparqlEscapeBool,
  uuid,
} from 'mu';
import { triplesToResources } from './lib/utils';
import { CONCEPTS, TYPES, URI_BASES } from './constants';

app.get('/', function(_req, res) {
  res.send('The agenda-submission-service is alive!');
});

app.post('/meetings/:id/submit', async function(req, res, next) {
  console.debug(req.params);
  console.debug(req.body);
  const meetingId = req.params.id;
  const subcaseUri = req.body.subcase;

  if (!meetingId) {
    return next({ message: 'Path parameter meeting ID was not set, cannot proceed', status: 400 });
  }

   if (!subcaseUri) {
    return next({ message: 'Body does not contain a "subcase" field, cannot proceed', status: 400 });
   }

  // Get latest agenda from meeting

  // Get all submission activities and check if they're already linked to an agenda activity
  // → If there are submission activities without agenda activities, use those
  // → If none exist, create a new submission activity
  // → Ensure that whatever submission activities are going to be linked have ALL the pieces
  //
  // Real cases are:
  // - A new subcase which has 0 or 1 submission activities
  //  → IFF submission activity exists, use it
  //  → Else create new one
  // - A postponed subcase which has 0 to * submission activities
  //  → IFF no submission activity exists that is unlinked to an agenda activity, create new one and copy over ALL pieces from previous submission activities
  //  → Else copy over all pieces from previous submission activities to unlinked submission activity

  // Create agenda activity
  // → Set start date
  // → Link to subcase
  // → Link to all submissionActivities

  // Create decision activity
  // → Set start date to meeting start date
  // → Link to subcase
  // → Link to decision result code
  // → Link to meeting secretary

  // Create agenda item treatment
  // → Set created date
  // → Set modified date
  // → Link to decision activity

  // For all pieces related to submission activities
  // → Link new decision activity to sign flow if exists

  // Calculate next agendaitem number
  // Create agendaitem
  // → Set created date
  // → Set number
  // → Link to agenda
  // → Copy title from subcase
  // → Copy shortTitle from subcase
  // → Link to formally NOT OK
  // → Link to agendaitem type from subcase
  // → Link to mandatees from subcase
  // → Link to pieces from submission activities
  // → Link to linked pieces from subcase
  // → Link to agenda activity
  // → Link to agenda item treatment

  // Set modified date on agenda

  // Create news item if agendaitem is announcement

  // Info needed from each resources:
  // Meeting:
  //  - Latest agenda
  //  - Start date
  //  - Secretary
  //
  // Subcase:
  //  - Title
  //  - Short title
  //  - Mandatees
  //  - Agendaitem type
  //  - Linked pieces
  //
  // Submission activities:
  //  - Pieces
  //
  // Pieces (from submission activities)
  //  - Sign flow

  const qIsMeetingClosed = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>

ASK
WHERE {
  VALUES ?meetingId {
    ${sparqlEscapeString(meetingId)}
  }

  ?meeting mu:uuid ?meetingId ;
    besluitvorming:behandelt ?agenda .
}`;
  let response = await query(qIsMeetingClosed);
  if (response?.boolean) {
    return next({ message: 'This meeting is already closed, the provided subcase cannot be submitted to it', status: 400 });
  }

  const qIsOnAgenda = `PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>

ASK
WHERE {
  VALUES ?subcase {
    ${sparqlEscapeUri(subcaseUri)}
  }
  VALUES ?postponed {
    ${sparqlEscapeUri(CONCEPTS.DECISION_RESULT_CODES.POSTPONED)}
  }

  ?agendaActivity besluitvorming:vindtPlaatsTijdens ?subcase ;
                  besluitvorming:genereertAgendapunt ?agendaitem .
  ?agenda dct:hasPart ?agendaitem .
  ?agenda besluitvorming:isAgendaVoor ?meeting .
  ?treatment dct:subject ?agendaitem ;
             besluitvorming:heeftBeslissing ?decisionActivity .
  FILTER NOT EXISTS {
    ?decisionActivity besluitvorming:resultaat ?postponed .
    ?internalDecisionPublicationActivityUsed ext:internalDecisionPublicationActivityUsed ?meeting ;
                                             prov:startedAtTime ?startTime .
  }
}`;
  response = await query(qIsOnAgenda);
  if (response?.boolean) {
    return next({ message: 'The subcase is already submitted on an agenda and is not postponed, cannot resubmit it', status: 400 });
  }

  const q = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
PREFIX schema: <http://schema.org/>

CONSTRUCT {
  ?meeting a ?meetingType ;
    mu:uuid ?meetingId ;
    besluit:geplandeStart ?plannedStart ;
    ext:secretarisVoorVergadering ?secretary .
  ?agenda a ?agendaType ;
    besluitvorming:isAgendaVoor ?meeting .

  ?subcase a ?subcaseType ;
    dct:alternative ?shortTitle ;
    ext:agendapuntType ?agendaItemType ;
    dct:title ?title ;
    ext:heeftBevoegde ?mandatee ;
    ext:bevatReedsBezorgdeDocumentVersie ?linkedPiece .

  ?submissionActivity ext:indieningVindtPlaatsTijdens ?subcase ;
    prov:generated ?piece ;
    a ?submissionActivityType .

  ?agendaActivity prov:wasInformedBy ?submissionActivity .

  ?signFlow a ?signFlowType ;
    sign:heeftBeslissing ?decisionActivity .
  ?agendaitem a ?_agendaitemType ;
    schema:position ?agendaitemNumber .
}
WHERE {
  VALUES (?meetingId ?subcase)
  {
    (${sparqlEscapeString(meetingId)} ${sparqlEscapeUri(subcaseUri)})
  }
  ?meeting a ?meetingType ;
           mu:uuid ?meetingId ;
           besluit:geplandeStart ?plannedStart ;
           ^besluitvorming:isAgendaVoor ?agenda ;
            ext:secretarisVoorVergadering ?secretary .
  FILTER NOT EXISTS { ?newerAgenda prov:wasRevisionOf ?agenda }
  ?agenda a ?agendaType .

  ?subcase a ?subcaseType ;
           dct:alternative ?shortTitle ;
           ext:agendapuntType ?agendaItemType .
  OPTIONAL { ?subcase dct:title ?title }
  OPTIONAL { ?subcase ext:heeftBevoegde ?mandatee }
  OPTIONAL { ?subcase ext:bevatReedsBezorgdeDocumentversie ?linkedPiece }
  OPTIONAL {
    ?submissionActivity ext:indieningVindtPlaatsTijdens ?subcase ;
                        a ?submissionActivityType .
    ?submissionActivity prov:generated ?piece .
    OPTIONAL { ?agendaActivity prov:wasInformedBy ?submissionActivity }
    OPTIONAL {
      ?signMarkingActivity sign:gemarkeerdStuk ?piece ;
        sign:markeringVindtPlaatsTijdens ?signSubcase .
      ?signFlow a ?signFlowType ;
        sign:doorlooptHandtekening ?signSubcase ;
        sign:heeftBeslissing ?decisionActivity .
    }
  }
  OPTIONAL {
    ?agenda dct:hasPart ?agendaitem .
    ?agendaitem a ?_agendaitemType ;
      dct:type ?agendaItemType ;
      schema:position ?agendaitemNumber .
  }
}`;

  response = await query(q);

  const resources = triplesToResources(response, {
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': 'a',
    'http://www.w3.org/ns/prov#generated': 'pieces',
    '^http://www.w3.org/ns/prov#wasInformedBy': 'agendaActivity',
    'http://mu.semte.ch/vocabularies/ext/indieningVindtPlaatsTijdens': 'subcase',
    'http://mu.semte.ch/vocabularies/ext/bevatReedsBezorgdeDocumentVersie': 'linkedPieces',
    'http://mu.semte.ch/vocabularies/ext/heeftBevoegde': 'mandatees',
    'http://mu.semte.ch/vocabularies/ext/agendapuntType': 'agendaitemType',
    'http://purl.org/dc/terms/title': 'title',
    'http://purl.org/dc/terms/alternative': 'shortTitle',
    'http://mu.semte.ch/vocabularies/core/uuid': 'id',
    'http://data.vlaanderen.be/ns/besluit#geplandeStart': 'plannedStart',
    'http://mu.semte.ch/vocabularies/ext/secretarisVoorVergadering': 'secretary',
    'https://data.vlaanderen.be/ns/besluitvorming#isAgendaVoor': 'meeting',
    'http://mu.semte.ch/vocabularies/ext/handtekenen/heeftBeslissing': 'decisionActivity',
    'http://schema.org/position': 'number',
  });

  if (resources.length === 0) {
    return next({ message: 'The necessary data to put the provided subcase on this meeting could not be found.', status: 404 });
  }

  const submissionActivities = resources.filter((resource) => resource.a?.includes(TYPES.submissionActivity));
  console.debug(resources);
  console.debug(submissionActivities);

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
    console.debug('allPieces:', allPieces);
    console.debug('unsubmittedPieces:', unsubmittedPieces);
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
  console.debug('agendaActivity:', agendaActivity);

  const meeting = resources.filter((resource) => resource.a?.includes(TYPES.meeting)).at(0);
  const subcase = resources.filter((resource) => resource.a?.includes(TYPES.subcase)).at(0);
  const signFlows = resources.filter((resource) => resource.a?.includes(TYPES.signFlow));

  console.debug('meeting:', meeting);
  console.debug('subcase:', subcase);

  const decisionActivityId = uuid();
  const decisionActivity = {
    id: decisionActivityId,
    uri: `${URI_BASES.decisionActivity}${decisionActivityId}`,
    startDate: meeting.plannedStart.at(0),
    subcase: subcaseUri,
    secretary: meeting.secretary.at(0),
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

  const agenda = resources.filter((resource) => resource.a?.includes(TYPES.agenda)).at(0);
  const agendaitems = resources.filter((resource) => resource.a?.includes(TYPES.agendaitem));
  const agendaitemNumber = 1 + Math.max(0, ...agendaitems.map((agendaitem) => agendaitem.number.at(0)));
  const agendaitemId = uuid();
  const agendaitem = {
    id: agendaitemId,
    uri: `${URI_BASES.agendaitem}${agendaitemId}`,
    created: new Date(),
    agenda: agenda.uri,
    title: subcase.title?.at(0),
    shortTitle: subcase.shortTitle?.at(0),
    formallyOK: CONCEPTS.ACCEPTANCE_STATUSES.NOT_YET_OK,
    number: agendaitemNumber,
    agendaitemType: subcase.agendaitemType.at(0),
    mandatees: subcase.mandatees,
    pieces: allPieces,
    linkedPieces: subcase.linkedPieces,
    agendaActivity: agendaActivity.uri,
    treatment: treatment.uri,
  };
  console.debug(agendaitem);

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
      inNewsletter: true,
    };
  }

  let qUpdate = `PREFIX schema: <http://schema.org/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

DELETE {
  ${sparqlEscapeUri(agenda.uri)} dct:modified ?oldModified .
  ${signFlows.length ? signFlows.map((signFlow) => {
    return `${sparqlEscapeUri(signFlow.uri)} sign:heeftBeslissing ${sparqlEscapeUri(signFlow.decisionActivity.at(0))} .`
  }).join('  \n') : ''}
} INSERT {`;
  if (newSubmission) {
    qUpdate += `
  ${sparqlEscapeUri(newSubmission.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.submissionActivity)} ;
    mu:uuid ${sparqlEscapeString(newSubmission.id)} ;
    dossier:Activiteit.startdatum ${sparqlEscapeDateTime(newSubmission.startDate)} ;
    ${newSubmission.pieces?.length ? `prov:generated ${newSubmission.pieces.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ext:indieningVindtPlaatsTijdens ${sparqlEscapeUri(newSubmission.subcase)} .`;
  }

  if (newsItem) {
    qUpdate += `
  ${sparqlEscapeUri(newsItem.uri)} a ${sparqlEscapeUri(TYPES.newsItem)} ;
    mu:uuid ${sparqlEscapeString(newsItem.id)} ;
    prov:wasDerivedFrom ${sparqlEscapeUri(newsItem.treatment)} ;
    dct:title ${sparqlEscapeString(newsItem.title)} ;
    ${newsItem.htmlContent ? `nie:htmlContent ${sparqlEscapeString(newsItem.htmlContent)} ;` : ''}
    ext:afgewerkt ${sparqlEscapeBool(newsItem.finished)} ;
    ext:inNieuwsbrief ${sparqlEscapeBool(newsItem.inNewsletter)} .`;
  }

  qUpdate += `
  ${sparqlEscapeUri(agendaActivity.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.agendaActivity)} ;
    mu:uuid ${sparqlEscapeString(agendaActivity.id)} ;
    dossier:startDatum ${sparqlEscapeDateTime(agendaActivity.startDate)} ;
    besluitvorming:vindtPlaatsTijdens ${sparqlEscapeUri(agendaActivity.subcase)} ;
    prov:wasInformedBy ${agendaActivity.submissionActivities.map((a) => sparqlEscapeUri(a.uri)).join(', ')} .`;

  qUpdate += `
  ${sparqlEscapeUri(decisionActivity.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.decisionActivity)} ;
    mu:uuid ${sparqlEscapeString(decisionActivity.id)} ;
    ${decisionActivity.secretary ? `prov:wasAssociatedWith ${sparqlEscapeUri(decisionActivity.secretary)} ;` : ''}
    ${decisionActivity.decisionResultCode ? `besluitvorming:resultaat ${sparqlEscapeUri(decisionActivity.decisionResultCode)} ;` : ''}
    dossier:Activiteit.startdatum ${sparqlEscapeDateTime(decisionActivity.startDate)} ;
    ext:beslissingVindtPlaatsTijdens ${sparqlEscapeUri(decisionActivity.subcase)} .`;

  qUpdate += `
  ${sparqlEscapeUri(treatment.uri)} a ${sparqlEscapeUri(TYPES.treatment)} ;
    mu:uuid ${sparqlEscapeString(treatment.id)} ;
    dct:created ${sparqlEscapeDateTime(treatment.created)} ;
    dct:modified ${sparqlEscapeDateTime(treatment.modified)} ;
    besluitvorming:heeftBeslissing ${sparqlEscapeUri(treatment.decisionActivity)} .`;

  qUpdate += `
  ${sparqlEscapeUri(agendaitem.uri)} a ${sparqlEscapeUri(TYPES.agendaitem)} ;
    mu:uuid ${sparqlEscapeString(agendaitem.id)} ;
    dct:created ${sparqlEscapeDateTime(agendaitem.created)} ;
    schema:position ${sparqlEscapeInt(agendaitem.number)} ;
    besluitvorming:korteTitel ${sparqlEscapeString(agendaitem.shortTitle)} ;
    ${agendaitem.title ? `dct:title ${sparqlEscapeString(agendaitem.title)} ;` : ''}
    ext:formeelOK ${sparqlEscapeUri(agendaitem.formallyOK)} ;
    ${agendaitem.mandatees?.length ? `ext:heeftBevoegdeVoorAgendapunt ${agendaitem.mandatees.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ${agendaitem.pieces?.length ? `besluitvorming:geagendeerdStuk ${agendaitem.pieces.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ${agendaitem.linkedPieces?.length ? `ext:bevatReedsBezorgdAgendapuntDocumentversie ${agendaitem.linkedPieces.map(sparqlEscapeUri).join(', ')} ;` : ''}
    dct:type ${sparqlEscapeUri(agendaitem.agendaitemType)} .

  ${sparqlEscapeUri(agendaitem.treatment)} dct:subject ${sparqlEscapeUri(agendaitem.uri)} .
  ${sparqlEscapeUri(agendaitem.agendaActivity)} besluitvorming:genereertAgendapunt ${sparqlEscapeUri(agendaitem.uri)} .
  ${sparqlEscapeUri(agendaitem.agenda)} dct:hasPart ${sparqlEscapeUri(agendaitem.uri)} .`;

  qUpdate += `
  ${sparqlEscapeUri(agenda.uri)} dct:modified ${sparqlEscapeDateTime(new Date())} .
  ${signFlows.length ? signFlows.map((signFlow) => {
    return `${sparqlEscapeUri(signFlow.uri)} sign:heeftBeslissing ${sparqlEscapeUri(decisionActivity.uri)} .`
  }).join('  \n') : ''}
} WHERE {
  ${sparqlEscapeUri(agenda.uri)} dct:modified ?oldModified .
}`;

  await update(qUpdate);

  return res.sendStatus(204);
});

app.use(errorHandler);
