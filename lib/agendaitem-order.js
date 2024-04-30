import { query, update, sparqlEscapeUri, sparqlEscapeInt } from 'mu';
import { reduceResultSet } from './utils';

async function getRelatedAgendaitems(agenda, agendaitemType) {
  const queryString = `PREFIX dct: <http://purl.org/dc/terms/>
PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
PREFIX schema: <http://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

SELECT DISTINCT ?agendaitem ?agendaitemCreated ?agendaitemPosition ?mandateePriority
WHERE {
  ${sparqlEscapeUri(agenda)} dct:hasPart ?agendaitem .
  ?agendaitem schema:position ?agendaitemPosition ;
              dct:created ?agendaitemCreated ;
              dct:type ${sparqlEscapeUri(agendaitemType)} .
  FILTER NOT EXISTS {
    ?agendaitem prov:wasRevisionOf ?olderAgendaitem .
  }
  ?agendaActivity besluitvorming:genereertAgendapunt ?agendaitem ;
    besluitvorming:vindtPlaatsTijdens ?subcase .
  OPTIONAL {
    ?subcase ext:heeftBevoegde ?mandatee .
    ?mandatee mandaat:rangorde ?mandateePriority .
  }
}`;
  return await query(queryString);
}

async function applyAgendaitemsOrder(orders) {
  const queryString = `PREFIX schema: <http://schema.org/>

DELETE {
  ?agendaitem schema:position ?oldPosition .
}
INSERT {
  ?agendaitem schema:position ?newPosition .
}
WHERE {
  VALUES (?agendaitem ?oldPosition ?newPosition) {
    ${orders
      .map(
        ({ uri, oldPosition, newPosition }) =>
          `(${sparqlEscapeUri(uri)} ${sparqlEscapeInt(oldPosition)} ${sparqlEscapeInt(newPosition)})`)
      .join('\n    ')}
  }
}`;
  await update(queryString);
}

async function reorderAgendaitems(agenda, agendaitemType) {
  const agendaitems = reduceResultSet(await getRelatedAgendaitems(agenda, agendaitemType));

  const sortedAgendaitems = sortAgendaitems(agendaitems);

  const lowestAgendaitemPosition = Math.min(...agendaitems.map((a) => parseInt(a.agendaitemPosition)));
  const toBeUpdatedAgendaitems = [];
  for (let i = 0; i < sortedAgendaitems.length; i++) {
    const { uri, agendaitemPosition } = sortedAgendaitems[i];
    const expectedAgendaitemPosition = lowestAgendaitemPosition + i;
    if (agendaitemPosition !== expectedAgendaitemPosition) {
      toBeUpdatedAgendaitems.push({
        uri,
        oldPosition: agendaitemPosition,
        newPosition: expectedAgendaitemPosition
      });
    }
  }
  if (toBeUpdatedAgendaitems.length) {
    await applyAgendaitemsOrder(toBeUpdatedAgendaitems);
  }
}


/* We sort on the mandatee priority. To do this, we simply cast the array of
 * priorities to a string: [1, 2, 3] → "1,2,3" and we just use string
 * comparisons to ensure we have a lexicographical sort. E.g. given the
 * following list of priorities: [ [1, 2], [1], [2, 4], [3], [2, 3] ]
 * the sorted list will be: [ [1], [1, 2], [2, 3], [2, 4], [3] ]
 * If multiple items have the same priority list, we sort them based on their
 * existing position. This way manual reorders inside a priority group are
 * kept when submitting a new agendaitem.
 */
function sortAgendaitems(agendaitems) {
  return agendaitems.sort((a1, a2) => {
    let priority1, priority2;
    let numberLength = 0;

    if (Array.isArray(a1.mandateePriority)) {
      priority1 = a1.mandateePriority.map((p) => p.toString());
    } else {
      priority1 = [a1.mandateePriority.toString()];
    }
    if (Array.isArray(a2.mandateePriority)) {
      priority2 = a2.mandateePriority.map((p) => p.toString());
    } else {
      priority2 = [a2.mandateePriority.toString()];
    }
    [...priority1, ...priority2].forEach((p) => numberLength = Math.max(numberLength, p.length));

    priority1 = priority1.map((p) => p.padStart(numberLength, '0')).sort();
    priority2 = priority2.map((p) => p.padStart(numberLength, '0')).sort();

    console.debug(priority1);
    console.debug(priority2);

    return priority1 === priority2
      ? a1.agendaitemPosition - a2.agendaitemPosition
      : priority1 < priority2
        ? -1
        : 1
  });
}

export {
  reorderAgendaitems,
}
