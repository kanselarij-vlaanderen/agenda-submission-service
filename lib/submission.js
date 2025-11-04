import { update, query, sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { GRAPHS } from '../constants';

async function linkNewsItemAndDecisionToSubmission(agendaitemUri, submissionId) {
  const queryString = `
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX subm: <http://mu.semte.ch/vocabularies/ext/submissions/>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

DELETE {
  GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
    ?submission subm:heeftVoorlopigNieuwsBericht ?anyNewsItem .
    ?submission subm:heeftVoorlopigeBeslissing ?anyDecisionReport .
  }
}
INSERT {
  GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
    ?submission subm:heeftVoorlopigNieuwsBericht ?newsItem .
    ?submission subm:heeftVoorlopigeBeslissing ?decisionReport .
  }
}
WHERE {
  GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
    ?submission a subm:Indiening ;
                mu:uuid ${sparqlEscapeString(submissionId)} ;
                subm:ingediendVoorProcedurestap ?subcase .
    OPTIONAL { ?submission subm:heeftVoorlopigNieuwsBericht ?anyNewsItem . }
    OPTIONAL { ?submission subm:heeftVoorlopigeBeslissing ?anyDecisionReport . }
  }
  GRAPH ${sparqlEscapeUri(GRAPHS.KANSELARIJ)} {
    ?agendaActivity besluitvorming:vindtPlaatsTijdens ?subcase ;
                    besluitvorming:genereertAgendapunt ${sparqlEscapeUri(agendaitemUri)} .
    ?treatment dct:subject ${sparqlEscapeUri(agendaitemUri)} .
    OPTIONAL {
      ?treatment besluitvorming:heeftBeslissing ?decisionActivity .
      ?decisionReport besluitvorming:beschrijft ?decisionActivity .
    }
    OPTIONAL {
      ?newsItem prov:wasDerivedFrom ?treatment .
    }
  }
}`;
  await update(queryString);
}

async function getNewsItemAndDecisionFromSubmission(submissionUri) {
  const queryString = `
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX subm: <http://mu.semte.ch/vocabularies/ext/submissions/>


SELECT ?newsItem ?decisionReport WHERE {
  GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
    ${sparqlEscapeUri(submissionUri)} a subm:Indiening .
    OPTIONAL { ${sparqlEscapeUri(submissionUri)} subm:heeftVoorlopigNieuwsBericht ?newsItem . }
    OPTIONAL { ${sparqlEscapeUri(submissionUri)} subm:heeftVoorlopigeBeslissing ?decisionReport . }
  }
}
`;
  const queryResult = await query(queryString);
    if (queryResult.results?.bindings?.length) {
    const result = queryResult.results.bindings[0];
    return { newsItem: result.newsItem?.value, decisionReport: result.decisionReport?.value };
  }
}

async function linkNewsItemAndDecisionFromSubmission(submissionUri, treatmentUri, decisionActivityUri ) {
  const queryString = `
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX subm: <http://mu.semte.ch/vocabularies/ext/submissions/>

DELETE {
  GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
    ${sparqlEscapeUri(submissionUri)} subm:heeftVoorlopigNieuwsBericht ?newsItem .
    ${sparqlEscapeUri(submissionUri)} subm:heeftVoorlopigeBeslissing ?decisionReport .
  }
}
INSERT {
  GRAPH ${sparqlEscapeUri(GRAPHS.KANSELARIJ)} {
    ?newsItem prov:wasDerivedFrom ${sparqlEscapeUri(treatmentUri)} .
    ?decisionReport besluitvorming:beschrijft ${sparqlEscapeUri(decisionActivityUri)} .
  }
}
WHERE {
  GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
    ${sparqlEscapeUri(submissionUri)} a subm:Indiening .
    OPTIONAL { ${sparqlEscapeUri(submissionUri)} subm:heeftVoorlopigNieuwsBericht ?newsItem . }
    OPTIONAL { ${sparqlEscapeUri(submissionUri)} subm:heeftVoorlopigeBeslissing ?decisionReport . }
  }
}
`;
  return await update(queryString);
}

export { linkNewsItemAndDecisionToSubmission, getNewsItemAndDecisionFromSubmission, linkNewsItemAndDecisionFromSubmission }