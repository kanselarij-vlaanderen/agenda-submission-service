import { query, sparqlEscapeUri } from 'mu';

async function isLoggedIn(sessionUri) {
  const queryString = `PREFIX session: <http://mu.semte.ch/vocabularies/session/>

ASK {
  ${sparqlEscapeUri(sessionUri)} session:account ?account .
}`;
  const response = await query(queryString);
  return response.boolean;
}

export { isLoggedIn }
