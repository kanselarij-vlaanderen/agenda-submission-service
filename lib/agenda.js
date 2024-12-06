import { query, sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { CONCEPTS, GRAPHS } from '../constants';
import { querySudo } from '@lblod/mu-auth-sudo';
import { reduceResultSet } from './utils';

async function isApprovedAgenda(agendaId) {
  const queryString = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>

ASK
WHERE {
  VALUES ?agendaId {
    ${sparqlEscapeString(agendaId)}
  }

  ?agenda mu:uuid ?agendaId ;
    besluitvorming:agendaStatus ${sparqlEscapeUri(CONCEPTS.AGENDA_STATUSES.APPROVED)} .
}`;
  const response = await query(queryString);
  return response.boolean;
}

async function getAgenda(agendaId) {
  const queryString = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

SELECT DISTINCT ?agenda
WHERE {
  VALUES ?agendaId {
    ${sparqlEscapeString(agendaId)}
  }

  ?agenda mu:uuid ?agendaId .
}`;
  const response = await query(queryString);
  if (response.results?.bindings?.length) {
    return response.results.bindings[0].agenda.value;
  }
  return null;
}

async function getAgendasForSubcase(subcaseId, useSudo=false) {
  const queryString = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX adms: <http://www.w3.org/ns/adms#>

SELECT DISTINCT (?meeting AS ?uri) ?meetingId ?agendaId ?agendaitemId ?plannedStart ?status ?kind ?number
${useSudo ? `FROM ${sparqlEscapeUri(GRAPHS.KANSELARIJ)}` : ''}
WHERE {
  ?subcase a dossier:Procedurestap ;
    mu:uuid ${sparqlEscapeString(subcaseId)} ;
    ^besluitvorming:vindtPlaatsTijdens ?agendaActivity .

  ?agendaActivity besluitvorming:genereertAgendapunt ?agendaitem .
  
  ?agendaitem mu:uuid ?agendaitemId .

  ?agenda dct:hasPart ?agendaitem ;
    mu:uuid ?agendaId ;
    besluitvorming:isAgendaVoor ?meeting ;
    besluitvorming:agendaStatus ?status .
  FILTER NOT EXISTS { ?newer prov:wasRevisionOf ?agenda }

  ?meeting mu:uuid ?meetingId ;
    dct:type ?kind ;
    adms:identifier ?number ;
    besluit:geplandeStart ?plannedStart .
}
ORDER BY DESC(?plannedStart)`;

  const queryFunction = useSudo ? querySudo : query;
  const response = await queryFunction(queryString);
  const agendas = reduceResultSet(response);
  if (agendas === null) {
    return []
  }
  return agendas;
}

export {
  isApprovedAgenda,
  getAgenda,
  getAgendasForSubcase,
}
