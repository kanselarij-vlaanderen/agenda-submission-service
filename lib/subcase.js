import { query, sparqlEscapeUri } from 'mu';
import { CONCEPTS } from '../constants';

async function isSubcaseOnAgenda(subcaseUri) {
  const queryString = `PREFIX prov: <http://www.w3.org/ns/prov#>
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
  const response = await query(queryString);
  return response.boolean;
}

export { isSubcaseOnAgenda }
