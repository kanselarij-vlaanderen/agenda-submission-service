import { query, update, sparqlEscapeString, sparqlEscapeUri, sparqlEscapeDateTime } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { reduceResultSet } from './utils';
import { GRAPHS } from '../constants';

async function isMeetingClosed(meetingId) {
  const queryString = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>

ASK
WHERE {
  VALUES ?meetingId {
    ${sparqlEscapeString(meetingId)}
  }

  ?meeting mu:uuid ?meetingId ;
    besluitvorming:behandelt ?agenda .
}`;
  const response = await query(queryString);
  return response.boolean;
}

async function submitSubmissionOnMeeting(submissionUri, meetingUri) {
  const queryString = `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX subm: <http://mu.semte.ch/vocabularies/ext/submissions/>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

DELETE {
  GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
    ${sparqlEscapeUri(submissionUri)} subm:ingediendVoorVergadering ?oldMeeting ;
                                      subm:geplandeStart ?oldPlannedStart .
  }
} INSERT {
  GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
    ${sparqlEscapeUri(submissionUri)} subm:ingediendVoorVergadering ${sparqlEscapeUri(meetingUri)} ;
                                      subm:geplandeStart ?plannedStart .
  }
} WHERE {
  GRAPH ${sparqlEscapeUri(GRAPHS.KANSELARIJ)} {
    ${sparqlEscapeUri(meetingUri)} besluit:geplandeStart ?plannedStart .
  }
  OPTIONAL {
    GRAPH ${sparqlEscapeUri(GRAPHS.SUBMISSION)} {
      ${sparqlEscapeUri(submissionUri)} subm:ingediendVoorVergadering ?oldMeeting ;
                                        subm:geplandeStart ?oldPlannedStart .
    }
  }
}`;
  await updateSudo(queryString);
}

async function getOpenMeetings() {
  const now = new Date();
  // subtract 1 week to counter submissions done the same day as the agenda
  now.setDate(now.getDate() - 7);
  const queryString = `PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT DISTINCT (?meeting AS ?uri) ?id ?serialnumber ?plannedStart ?type ?agendaId ?agenda
WHERE {
  ?meeting
    a besluit:Vergaderactiviteit ;
    mu:uuid ?id ;
    besluit:geplandeStart ?plannedStart ;
    dct:type ?kind .
  FILTER NOT EXISTS { ?meeting besluitvorming:behandelt ?finalAgenda }
  FILTER ( ?plannedStart > ${sparqlEscapeDateTime(now)})

  ?agenda besluitvorming:isAgendaVoor ?meeting ;
          besluitvorming:volgnummer ?serialnumber ;
          mu:uuid ?agendaId .
  ?kind skos:prefLabel ?type .
  FILTER NOT EXISTS { ?newerAgenda prov:wasRevisionOf ?agenda }
}
ORDER BY DESC(?plannedStart)`;
  const response = await querySudo(queryString);
  const openMeetings = reduceResultSet(response);
  if (openMeetings === null) {
    return [];
  }
  return openMeetings;
}

async function getMeetingForSubmission(submissionId) {
  // subtract 1 week to counter submissions done the same day as the agenda
  const queryString = `PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX subm: <http://mu.semte.ch/vocabularies/ext/submissions/>

SELECT DISTINCT (?meeting AS ?uri) ?id ?serialnumber ?plannedStart ?kind ?type ?agendaId ?agenda
WHERE {
  ?submission a subm:Indiening ;
              mu:uuid ${sparqlEscapeString(submissionId)} ;
              subm:ingediendVoorVergadering ?meeting.
  ?meeting a besluit:Vergaderactiviteit ;
           mu:uuid ?id ;
           besluit:geplandeStart ?plannedStart ;
           dct:type ?kind .

  ?agenda besluitvorming:isAgendaVoor ?meeting ;
          besluitvorming:volgnummer ?serialnumber ;
          mu:uuid ?agendaId .
  ?kind skos:prefLabel ?type .
  FILTER NOT EXISTS { ?newerAgenda prov:wasRevisionOf ?agenda }
}
`;
  const response = await querySudo(queryString);
  const meeting = reduceResultSet(response);
  return meeting?.at(0);
}

export {
  isMeetingClosed,
  getOpenMeetings,
  getMeetingForSubmission,
  submitSubmissionOnMeeting,
}
