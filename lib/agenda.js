import { query, sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { CONCEPTS } from '../constants';

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

export {
  isApprovedAgenda,
  getAgenda,
}
