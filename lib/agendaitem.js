import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { CONCEPTS, GRAPHS } from '../constants';
import { querySudo } from '@lblod/mu-auth-sudo';
import { reduceResultSet } from './utils';

async function getPreliminaryDecisionResultCode(agendaitemId) {
  const queryString = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT (?decisionResultCode AS ?uri) ?id
WHERE {
  VALUES ?decisionResultCode {
    ${sparqlEscapeUri(CONCEPTS.DECISION_RESULT_CODES.POSTPONED)}
    ${sparqlEscapeUri(CONCEPTS.DECISION_RESULT_CODES.RETRACTED)}
  }
  GRAPH ${sparqlEscapeUri(GRAPHS.KANSELARIJ)} {
    ?agendaitem a besluit:Agendapunt ;
                mu:uuid ${sparqlEscapeString(agendaitemId)} .
    ?agendaitemTreatment a besluit:BehandelingVanAgendapunt ;
                         dct:subject ?agendaitem ;
                         besluitvorming:heeftBeslissing ?decisionActivity .
    ?decisionActivity besluitvorming:resultaat ?decisionResultCode .
  }
  GRAPH ${sparqlEscapeUri(GRAPHS.PUBLIC)} {
    ?decisionResultCode mu:uuid ?id .
  }
} LIMIT 1`;
  const response = await querySudo(queryString);
  const decisionResultCodes = reduceResultSet(response);
  if (decisionResultCodes === null || decisionResultCodes.length === 0) {
    return { data: null };
  }
  return {
    data: {
      uri: decisionResultCodes[0].uri,
      id: decisionResultCodes[0].id
    }
  };
}

export {
  getPreliminaryDecisionResultCode,
}
