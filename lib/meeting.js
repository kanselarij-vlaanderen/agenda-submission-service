import { query, update, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { reduceResultSet } from './utils';

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

INSERT DATA {
  ${sparqlEscapeUri(submissionUri)} subm:ingediendVoorVergadering ${sparqlEscapeUri(meetingUri)} .
}`;
  await update(queryString);
}

async function getOpenMeetings() {
  const queryString = `PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>

SELECT DISTINCT (?meeting AS ?uri) ?id ?agendaNumber
WHERE {
  ?meeting
    a besluit:Vergaderactiviteit ;
    mu:uuid ?id ;
    besluit:geplandeStart ?plannedStart .
  FILTER NOT EXISTS { ?meeting besluitvorming:behandelt ?finalAgenda }

  ?agenda besluitvorming:isAgendaVoor ?meeting ;
          besluitvorming:volgnummer ?agendaNumber .
  FILTER NOT EXISTS { ?newerAgenda prov:wasRevisionOf ?agenda }
}
ORDER BY DESC(?plannedStart)`;
  const response = await querySudo(queryString);
  return reduceResultSet(response);
}

export {
  isMeetingClosed,
  getOpenMeetings,
  submitSubmissionOnMeeting,
}
