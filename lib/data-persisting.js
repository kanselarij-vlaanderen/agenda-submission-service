import {
  update,
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeInt,
  sparqlEscapeBool,
} from 'mu';

import { TYPES } from '../constants';

async function persistRecords({
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
    dct:type ${sparqlEscapeUri(agendaitem.agendaitemType)} .

  ${sparqlEscapeUri(agendaitem.treatment)} dct:subject ${sparqlEscapeUri(agendaitem.uri)} .
  ${sparqlEscapeUri(agendaitem.agendaActivity)} besluitvorming:genereertAgendapunt ${sparqlEscapeUri(agendaitem.uri)} .
  ${sparqlEscapeUri(agendaitem.agenda)} dct:hasPart ${sparqlEscapeUri(agendaitem.uri)} .`;

  if (agendaitem.privateComment) {
    queryString += `
  ${sparqlEscapeUri(agendaitem.uri)} ext:privateComment ${sparqlEscapeString(agendaitem.privateComment)} .`;
  }

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
    ext:afgewerkt ${sparqlEscapeBool(newsItem.finished)} ;
    ext:inNieuwsbrief ${sparqlEscapeBool(newsItem.inNewsletter)} .`;
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

export {
  persistRecords,
}
