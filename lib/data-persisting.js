import {
  update,
  query,
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeInt,
} from 'mu';

import { TYPES } from '../constants';

const SINGLE_PERSIST_QUERY = ["yes", "true", true, "1", 1, "on"].includes(process.env.SINGLE_PERSIST_QUERY); // default false
const PIECE_QUERY_BATCH_SIZE = parseInt(process.env.PIECE_QUERY_BATCH_SIZE) || 25 ;

function sparqlEscapeBoolCustom(value) {
  return value
    ? '"true"^^<http://mu.semte.ch/vocabularies/typed-literals/boolean>'
    : '"false"^^<http://mu.semte.ch/vocabularies/typed-literals/boolean>';
}

async function persistAndVerifyRecords({
  agenda,
  signFlows,
  newSubmission,
  newsItem,
  agendaActivity,
  decisionActivity,
  treatment,
  agendaitem,
}) {
  let recordsVerified = false;
  try {
    if (!SINGLE_PERSIST_QUERY) {
      await _persistAgendaActivity(agendaActivity);
      await _persistDecisionActivity(decisionActivity);
      await _persistAgendaItemTreatment(treatment);
      await _persistAgendaitem(agendaitem);
      if (newSubmission) {
        await _persistSubmissionActivity(newSubmission);
      }
      if (newsItem) {
        await _persistNewsItem(newsItem);
      }
      await _updateSignFlowAndAgendaModified(agenda, signFlows, decisionActivity);
    } else {
      await _bulkPersist({
        agenda,
        signFlows,
        newSubmission,
        newsItem,
        agendaActivity,
        decisionActivity,
        treatment,
        agendaitem,
      });
    }

    recordsVerified = await _verifyRecords({
      agendaitem,
      treatment,
      agendaActivity,
      decisionActivity,
      newSubmission,
      newsItem,
      agenda,
      signFlows,
    });
  } catch (error) {
    console.error("Failed to verify records after creation");
    console.log(error);
  } finally {
    if (!recordsVerified) {
      await _deleteRecords({
        agendaitem,
        treatment,
        agendaActivity,
        decisionActivity,
        newSubmission,
        newsItem,
      });
      throw new Error(
        "Could not verify created data, incorrect data has been deleted and it should be possible to submit for meeting again"
      );
    }
  }
}

async function _bulkPersist({
  agenda,
  signFlows,
  newSubmission,
  newsItem,
  agendaActivity,
  decisionActivity,
  treatment,
  agendaitem
}) {
  let queryString = `PREFIX schema: <http://schema.org/>
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
} INSERT {
  ${sparqlEscapeUri(agendaActivity.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.agendaActivity)} ;
    mu:uuid ${sparqlEscapeString(agendaActivity.id)} ;
    dossier:startDatum ${sparqlEscapeDateTime(agendaActivity.startDate)} ;
    besluitvorming:vindtPlaatsTijdens ${sparqlEscapeUri(agendaActivity.subcase)} ;
    prov:wasInformedBy ${agendaActivity.submissionActivities.map((a) => sparqlEscapeUri(a.uri)).join(', ')} .

  ${sparqlEscapeUri(decisionActivity.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.decisionActivity)} ;
    mu:uuid ${sparqlEscapeString(decisionActivity.id)} ;
    ${decisionActivity.secretary ? `prov:wasAssociatedWith ${sparqlEscapeUri(decisionActivity.secretary)} ;` : ''}
    ${decisionActivity.decisionResultCode ? `besluitvorming:resultaat ${sparqlEscapeUri(decisionActivity.decisionResultCode)} ;` : ''}
    dossier:Activiteit.startdatum ${sparqlEscapeDateTime(decisionActivity.startDate)} ;
    ext:beslissingVindtPlaatsTijdens ${sparqlEscapeUri(decisionActivity.subcase)} .

  ${sparqlEscapeUri(treatment.uri)} a ${sparqlEscapeUri(TYPES.treatment)} ;
    mu:uuid ${sparqlEscapeString(treatment.id)} ;
    dct:created ${sparqlEscapeDateTime(treatment.created)} ;
    dct:modified ${sparqlEscapeDateTime(treatment.modified)} ;
    besluitvorming:heeftBeslissing ${sparqlEscapeUri(treatment.decisionActivity)} .

  ${sparqlEscapeUri(agendaitem.uri)} a ${sparqlEscapeUri(TYPES.agendaitem)} ;
    mu:uuid ${sparqlEscapeString(agendaitem.id)} ;
    dct:created ${sparqlEscapeDateTime(agendaitem.created)} ;
    schema:position ${sparqlEscapeInt(agendaitem.number)} ;
    besluitvorming:korteTitel ${sparqlEscapeString(agendaitem.shortTitle)} ;
    ${agendaitem.title ? `dct:title ${sparqlEscapeString(agendaitem.title)} ;` : ''}
    ext:formeelOK ${sparqlEscapeUri(agendaitem.formallyOk)} ;
    ${agendaitem.mandatees?.length ? `ext:heeftBevoegdeVoorAgendapunt ${agendaitem.mandatees.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ${agendaitem.pieces?.length ? `besluitvorming:geagendeerdStuk ${agendaitem.pieces.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ${agendaitem.linkedPieces?.length ? `ext:bevatReedsBezorgdAgendapuntDocumentversie ${agendaitem.linkedPieces.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ext:isGoedkeuringVanDeNotulen ${sparqlEscapeBoolCustom(agendaitem.isApproval)} ;
    dct:type ${sparqlEscapeUri(agendaitem.agendaitemType)} .

  ${sparqlEscapeUri(agendaitem.treatment)} dct:subject ${sparqlEscapeUri(agendaitem.uri)} .
  ${sparqlEscapeUri(agendaitem.agendaActivity)} besluitvorming:genereertAgendapunt ${sparqlEscapeUri(agendaitem.uri)} .
  ${sparqlEscapeUri(agendaitem.agenda)} dct:hasPart ${sparqlEscapeUri(agendaitem.uri)} .`;

  if (newSubmission) {
    queryString += `
  ${sparqlEscapeUri(newSubmission.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.submissionActivity)} ;
    mu:uuid ${sparqlEscapeString(newSubmission.id)} ;
    dossier:Activiteit.startdatum ${sparqlEscapeDateTime(newSubmission.startDate)} ;
    ${newSubmission.pieces?.length ? `prov:generated ${newSubmission.pieces.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ext:indieningVindtPlaatsTijdens ${sparqlEscapeUri(newSubmission.subcase)} .`;
  }

  if (newsItem) {
    queryString += `
  ${sparqlEscapeUri(newsItem.uri)} a ${sparqlEscapeUri(TYPES.newsItem)} ;
    mu:uuid ${sparqlEscapeString(newsItem.id)} ;
    prov:wasDerivedFrom ${sparqlEscapeUri(newsItem.treatment)} ;
    dct:title ${sparqlEscapeString(newsItem.title)} ;
    ${newsItem.htmlContent ? `nie:htmlContent ${sparqlEscapeString(newsItem.htmlContent)} ;` : ''}
    ext:afgewerkt ${sparqlEscapeBoolCustom(newsItem.finished)} ;
    ext:inNieuwsbrief ${sparqlEscapeBoolCustom(newsItem.inNewsletter)} .`;
  }

  queryString += `
  ${sparqlEscapeUri(agenda.uri)} dct:modified ${sparqlEscapeDateTime(new Date())} .
  ${signFlows.length ? signFlows.map((signFlow) => {
    return `${sparqlEscapeUri(signFlow.uri)} sign:heeftBeslissing ${sparqlEscapeUri(decisionActivity.uri)} .`
  }).join('  \n') : ''}
} WHERE {
  ${sparqlEscapeUri(agenda.uri)} dct:modified ?oldModified .
}`;

  await update(queryString);
}

async function _persistAgendaActivity(agendaActivity) {
  const queryString = `
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

  INSERT DATA {
    ${sparqlEscapeUri(agendaActivity.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.agendaActivity)} ;
    mu:uuid ${sparqlEscapeString(agendaActivity.id)} ;
    dossier:startDatum ${sparqlEscapeDateTime(agendaActivity.startDate)} ;
    besluitvorming:vindtPlaatsTijdens ${sparqlEscapeUri(agendaActivity.subcase)} ;
    prov:wasInformedBy ${agendaActivity.submissionActivities.map((a) => sparqlEscapeUri(a.uri)).join(', ')} .
  }`;
  await update(queryString);
}

async function _persistDecisionActivity(decisionActivity) {
const queryString = `
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  INSERT DATA {
    ${sparqlEscapeUri(decisionActivity.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.decisionActivity)} ;
    mu:uuid ${sparqlEscapeString(decisionActivity.id)} ;
    ${decisionActivity.secretary ? `prov:wasAssociatedWith ${sparqlEscapeUri(decisionActivity.secretary)} ;` : ''}
    ${decisionActivity.decisionResultCode ? `besluitvorming:resultaat ${sparqlEscapeUri(decisionActivity.decisionResultCode)} ;` : ''}
    dossier:Activiteit.startdatum ${sparqlEscapeDateTime(decisionActivity.startDate)} ;
    ext:beslissingVindtPlaatsTijdens ${sparqlEscapeUri(decisionActivity.subcase)} .
  }`;
  await update(queryString);
}

async function _persistAgendaItemTreatment(treatment) {
  const queryString = `
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX dct: <http://purl.org/dc/terms/>

  INSERT DATA {
    ${sparqlEscapeUri(treatment.uri)} a ${sparqlEscapeUri(TYPES.treatment)} ;
    mu:uuid ${sparqlEscapeString(treatment.id)} ;
    dct:created ${sparqlEscapeDateTime(treatment.created)} ;
    dct:modified ${sparqlEscapeDateTime(treatment.modified)} ;
    besluitvorming:heeftBeslissing ${sparqlEscapeUri(treatment.decisionActivity)} .
  }`;
  await update(queryString);
}

/* Persist links to pieces for the supplied resource in the triplestore in batch.
  resourceUri: the subject of the triple resource, predicate, piece
  pieces: the array of piece URIs
  predicate: the full URI (without <>) of the predicate used to link from resource to piece
*/
async function _persistPieces(resourceUri, pieces, predicate) {
  if (pieces?.length) {
    const nrOfBatches = Math.ceil(pieces.length / PIECE_QUERY_BATCH_SIZE);
    for (let currentBatch = 0; currentBatch < nrOfBatches; currentBatch++) {
      const startIndex = currentBatch * PIECE_QUERY_BATCH_SIZE;
      const endIndex = startIndex + PIECE_QUERY_BATCH_SIZE;
      const currentPieces = pieces.slice(startIndex, endIndex);
      const batchedQuery = `INSERT DATA {
        ${sparqlEscapeUri(resourceUri)} ${sparqlEscapeUri(predicate)} ${currentPieces.map(sparqlEscapeUri).join(', ')} .
      }
      `;
      await update(batchedQuery);
    }
  }
}

async function _persistAgendaitem(agendaitem) {
  const queryString = `PREFIX schema: <http://schema.org/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX dct: <http://purl.org/dc/terms/>

  INSERT DATA {
    ${sparqlEscapeUri(agendaitem.uri)} a ${sparqlEscapeUri(TYPES.agendaitem)} ;
    mu:uuid ${sparqlEscapeString(agendaitem.id)} ;
    dct:created ${sparqlEscapeDateTime(agendaitem.created)} ;
    schema:position ${sparqlEscapeInt(agendaitem.number)} ;
    besluitvorming:korteTitel ${sparqlEscapeString(agendaitem.shortTitle)} ;
    ${agendaitem.title ? `dct:title ${sparqlEscapeString(agendaitem.title)} ;` : ''}
    ext:formeelOK ${sparqlEscapeUri(agendaitem.formallyOk)} ;
    ${agendaitem.mandatees?.length ? `ext:heeftBevoegdeVoorAgendapunt ${agendaitem.mandatees.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ext:isGoedkeuringVanDeNotulen ${sparqlEscapeBoolCustom(agendaitem.isApproval)} ;
    dct:type ${sparqlEscapeUri(agendaitem.agendaitemType)} .

    ${sparqlEscapeUri(agendaitem.treatment)} dct:subject ${sparqlEscapeUri(agendaitem.uri)} .
    ${sparqlEscapeUri(agendaitem.agendaActivity)} besluitvorming:genereertAgendapunt ${sparqlEscapeUri(agendaitem.uri)} .
    ${sparqlEscapeUri(agendaitem.agenda)} dct:hasPart ${sparqlEscapeUri(agendaitem.uri)} .
  }`;
  await update(queryString);
  await _persistPieces(agendaitem.uri, agendaitem.pieces, "https://data.vlaanderen.be/ns/besluitvorming#geagendeerdStuk");
  await _persistPieces(agendaitem.uri, agendaitem.linkedPieces, "http://mu.semte.ch/vocabularies/ext/bevatReedsBezorgdAgendapuntDocumentversie");
}

async function _persistSubmissionActivity(newSubmission) {
  const queryString = `
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  INSERT DATA {
    ${sparqlEscapeUri(newSubmission.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.submissionActivity)} ;
    mu:uuid ${sparqlEscapeString(newSubmission.id)} ;
    dossier:Activiteit.startdatum ${sparqlEscapeDateTime(newSubmission.startDate)} ;
    ext:indieningVindtPlaatsTijdens ${sparqlEscapeUri(newSubmission.subcase)} .
  }`;
  await update(queryString);
  await _persistPieces(newSubmission.uri, newSubmission.pieces, "http://www.w3.org/ns/prov#generated");
}

async function _persistNewsItem(newsItem) {
  const queryString = `
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

  INSERT DATA {
    ${sparqlEscapeUri(newsItem.uri)} a ${sparqlEscapeUri(TYPES.newsItem)} ;
    mu:uuid ${sparqlEscapeString(newsItem.id)} ;
    prov:wasDerivedFrom ${sparqlEscapeUri(newsItem.treatment)} ;
    dct:title ${sparqlEscapeString(newsItem.title)} ;
    ${newsItem.htmlContent ? `nie:htmlContent ${sparqlEscapeString(newsItem.htmlContent)} ;` : ''}
    ext:afgewerkt ${sparqlEscapeBoolCustom(newsItem.finished)} ;
    ext:inNieuwsbrief ${sparqlEscapeBoolCustom(newsItem.inNewsletter)} .
  }`;
  await update(queryString);
}

async function _updateSignFlowAndAgendaModified(agenda, signFlows, decisionActivity) {
  const queryString = `
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
  PREFIX dct: <http://purl.org/dc/terms/>

  DELETE {
    ${sparqlEscapeUri(agenda.uri)} dct:modified ?oldModified .
    ${signFlows.length ? signFlows.map((signFlow) => {
      return `${sparqlEscapeUri(signFlow.uri)} sign:heeftBeslissing ${sparqlEscapeUri(signFlow.decisionActivity.at(0))} .`
    }).join('  \n') : ''}
  } INSERT {
    ${sparqlEscapeUri(agenda.uri)} dct:modified ${sparqlEscapeDateTime(new Date())} .
    ${signFlows.length ? signFlows.map((signFlow) => {
      return `${sparqlEscapeUri(signFlow.uri)} sign:heeftBeslissing ${sparqlEscapeUri(decisionActivity.uri)} .`
    }).join('  \n') : ''}
  } WHERE {
    ${sparqlEscapeUri(agenda.uri)} dct:modified ?oldModified .
  }
  `
  await update(queryString);
}

/* Verify the existence of pieces for the supplied resource in the triplestore in batch.
  resourceUri: the subject of the triple resource, predicate, piece
  pieces: the array of piece URIs
  predicate: the full URI (without <>) of the predicate used to link from resource to piece
*/
async function _verifyPieces(resourceUri, pieces, predicate) {
  if (pieces?.length) {
    const nrOfBatches = Math.ceil(pieces.length / PIECE_QUERY_BATCH_SIZE);
    for (let currentBatch = 0; currentBatch < nrOfBatches; currentBatch++) {
      const startIndex = currentBatch * PIECE_QUERY_BATCH_SIZE;
      const endIndex = startIndex + PIECE_QUERY_BATCH_SIZE;
      const currentPieces = pieces.slice(startIndex, endIndex);
      const batchedQuery = `ASK WHERE {
        ${sparqlEscapeUri(resourceUri)} ${sparqlEscapeUri(predicate)} ${currentPieces.map(sparqlEscapeUri).join(', ')} .
      }
      `;
      const batchedResults = await query(batchedQuery);
      if (!batchedResults.boolean) {
        // as soon as one of the queries fails, the whole process is considered failed
        return false;
      }
    }
  }
  return true;
}

async function _verifyRecords({
  agenda,
  signFlows,
  newSubmission,
  newsItem,
  agendaActivity,
  decisionActivity,
  treatment,
  agendaitem
}) {
  // first verify the existence of the agendaitem and related metdata
  let queryString = `PREFIX schema: <http://schema.org/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

ASK WHERE {
  ${sparqlEscapeUri(agendaActivity.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.agendaActivity)} ;
    mu:uuid ${sparqlEscapeString(agendaActivity.id)} ;
    dossier:startDatum ${sparqlEscapeDateTime(agendaActivity.startDate)} ;
    besluitvorming:vindtPlaatsTijdens ${sparqlEscapeUri(agendaActivity.subcase)} ;
    prov:wasInformedBy ${agendaActivity.submissionActivities.map((a) => sparqlEscapeUri(a.uri)).join(', ')} .

  ${sparqlEscapeUri(decisionActivity.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.decisionActivity)} ;
    mu:uuid ${sparqlEscapeString(decisionActivity.id)} ;
    ${decisionActivity.secretary ? `prov:wasAssociatedWith ${sparqlEscapeUri(decisionActivity.secretary)} ;` : ''}
    ${decisionActivity.decisionResultCode ? `besluitvorming:resultaat ${sparqlEscapeUri(decisionActivity.decisionResultCode)} ;` : ''}
    dossier:Activiteit.startdatum ${sparqlEscapeDateTime(decisionActivity.startDate)} ;
    ext:beslissingVindtPlaatsTijdens ${sparqlEscapeUri(decisionActivity.subcase)} .

  ${sparqlEscapeUri(treatment.uri)} a ${sparqlEscapeUri(TYPES.treatment)} ;
    mu:uuid ${sparqlEscapeString(treatment.id)} ;
    dct:created ${sparqlEscapeDateTime(treatment.created)} ;
    dct:modified ${sparqlEscapeDateTime(treatment.modified)} ;
    besluitvorming:heeftBeslissing ${sparqlEscapeUri(treatment.decisionActivity)} .

  ${sparqlEscapeUri(agendaitem.uri)} a ${sparqlEscapeUri(TYPES.agendaitem)} ;
    mu:uuid ${sparqlEscapeString(agendaitem.id)} ;
    dct:created ${sparqlEscapeDateTime(agendaitem.created)} ;
    schema:position ?anyNumber ;
    besluitvorming:korteTitel ${sparqlEscapeString(agendaitem.shortTitle)} ;
    ${agendaitem.title ? `dct:title ${sparqlEscapeString(agendaitem.title)} ;` : ''}
    ext:formeelOK ${sparqlEscapeUri(agendaitem.formallyOk)} ;
    ${agendaitem.mandatees?.length ? `ext:heeftBevoegdeVoorAgendapunt ${agendaitem.mandatees.map(sparqlEscapeUri).join(', ')} ;` : ''}
    ext:isGoedkeuringVanDeNotulen ${sparqlEscapeBoolCustom(agendaitem.isApproval)} ;
    dct:type ${sparqlEscapeUri(agendaitem.agendaitemType)} .

  ${sparqlEscapeUri(agendaitem.treatment)} dct:subject ${sparqlEscapeUri(agendaitem.uri)} .
  ${sparqlEscapeUri(agendaitem.agendaActivity)} besluitvorming:genereertAgendapunt ${sparqlEscapeUri(agendaitem.uri)} .
  ${sparqlEscapeUri(agendaitem.agenda)} dct:hasPart ${sparqlEscapeUri(agendaitem.uri)} .`;

  if (newSubmission) {
    queryString += `
  ${sparqlEscapeUri(newSubmission.uri)} a ${sparqlEscapeUri(TYPES.activity)}, ${sparqlEscapeUri(TYPES.submissionActivity)} ;
    mu:uuid ${sparqlEscapeString(newSubmission.id)} ;
    dossier:Activiteit.startdatum ${sparqlEscapeDateTime(newSubmission.startDate)} ;
    ext:indieningVindtPlaatsTijdens ${sparqlEscapeUri(newSubmission.subcase)} .`;
  }

  if (newsItem) {
    queryString += `
  ${sparqlEscapeUri(newsItem.uri)} a ${sparqlEscapeUri(TYPES.newsItem)} ;
    mu:uuid ${sparqlEscapeString(newsItem.id)} ;
    prov:wasDerivedFrom ${sparqlEscapeUri(newsItem.treatment)} ;
    dct:title ${sparqlEscapeString(newsItem.title)} ;
    ${newsItem.htmlContent ? `nie:htmlContent ${sparqlEscapeString(newsItem.htmlContent)} ;` : ''}
    ext:afgewerkt ${sparqlEscapeBoolCustom(newsItem.finished)} ;
    ext:inNieuwsbrief ${sparqlEscapeBoolCustom(newsItem.inNewsletter)} .`;
  }
  queryString += `}`
  const results = await query(queryString);
  if (!results.boolean) {
    return false;
  }
  // now check if all pieces were added. We batch this, since the list may include hundreds of pieces
  const piecesExist = await _verifyPieces(agendaitem.uri, agendaitem.pieces, "https://data.vlaanderen.be/ns/besluitvorming#geagendeerdStuk");
  if (!piecesExist) {
    return false;
  }
  const linkedPiecesExist = await _verifyPieces(agendaitem.uri, agendaitem.linkedPieces, "http://mu.semte.ch/vocabularies/ext/bevatReedsBezorgdAgendapuntDocumentversie");
  if (!linkedPiecesExist) {
    return false;
  }
  if (newSubmission) {
    const submittedPiecesExist = await _verifyPieces(newSubmission.uri, newSubmission.pieces, "http://www.w3.org/ns/prov#generated");
    if (!submittedPiecesExist) {
      return false;
    }
  }
  return true;
}

async function _deleteRecords({
  newSubmission,
  newsItem,
  agendaActivity,
  decisionActivity,
  treatment,
  agendaitem,
}) {
  await update(`
    DELETE WHERE {
      ${sparqlEscapeUri(agendaActivity.uri)} ?p ?o .
    }
    `);

  await update(`
    DELETE WHERE {
      ?s ?p ${sparqlEscapeUri(agendaActivity.uri)} .
  }
    `);

  await update(`
    DELETE WHERE {
      ${sparqlEscapeUri(decisionActivity.uri)} ?p ?o .
  }
    `);

  await update(`
    DELETE WHERE {
      ?s ?p ${sparqlEscapeUri(decisionActivity.uri)} .
  }
    `);

  await update(`
    DELETE WHERE {
      ${sparqlEscapeUri(treatment.uri)} ?p ?o .
  }
    `);

  await update(`
    DELETE WHERE {
      ?s ?p ${sparqlEscapeUri(treatment.uri)} .
  }
    `);

  await update(`
    DELETE WHERE {
      ${sparqlEscapeUri(agendaitem.uri)} ?p ?o .
  }
    `);

  await update(`
    DELETE WHERE {
      ?s ?p ${sparqlEscapeUri(agendaitem.uri)} .
  }
    `);

  if (newSubmission) {
    await update(`
      DELETE WHERE {
        ${sparqlEscapeUri(newSubmission.uri)} ?p ?o .
    }
      `);

    await update(`
      DELETE WHERE {
        ?s ?p ${sparqlEscapeUri(newSubmission.uri)} .
    }
      `);
  }

  if (newsItem) {
    await update(`
      DELETE WHERE {
        ${sparqlEscapeUri(newsItem.uri)} ?p ?o .
    }
      `);

    await update(`
      DELETE WHERE {
        ?s ?p ${sparqlEscapeUri(newsItem.uri)} .
    }
      `);
  }
}

export {
  persistAndVerifyRecords,
}
