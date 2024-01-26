import { query, sparqlEscapeString } from 'mu';

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

export { isMeetingClosed }
