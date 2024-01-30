import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { responseToTriples, triplesToResources } from './utils';
import { TYPES } from '../constants';

async function getRelatedResources(meetingId, subcaseUri) {
  const response = await getRelatedData(meetingId, subcaseUri);
  const triples = responseToTriples(response);
  const resources = triplesToResources(triples, {
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

  const resourcesByType = (type) => resources.filter((resource) => resource.a?.includes(type));

  return {
    meeting: resourcesByType(TYPES.meeting).at(0),
    agenda: resourcesByType(TYPES.agenda).at(0),
    agendaitems: resourcesByType(TYPES.agendaitem),
    subcase: resourcesByType(TYPES.subcase).at(0),
    submissionActivities: resourcesByType(TYPES.submissionActivity),
    signFlows: resourcesByType(TYPES.signFlow),
  };
}

async function getRelatedData(meetingId, subcaseUri) {
  const queryString = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
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
           ^besluitvorming:isAgendaVoor ?agenda .
  OPTIONAL { ?meeting ext:secretarisVoorVergadering ?secretary }
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

  return await query(queryString);
}

export {
  getRelatedResources,
}
