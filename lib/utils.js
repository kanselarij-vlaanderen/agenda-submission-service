import { sparqlEscape } from 'mu';

function arrayEquals(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length
    && a.every((element, index) => element === b[index]);
}

function responseToTriples(response) {
  const { head, results } = response;
  if (!arrayEquals(head.vars, ['s', 'p', 'o'])) {
    console.warn(
      'Expected a response containing triples as returned from a CONSTRUCT query, got following variables instead:',
      head.vars
    );
    return [];
  }

  return results.bindings;
}

/**
 * Maps all incoming triples to ?s ?p ?o where ?s is alwasy the uri, ?o can be uri or value
 * @param {*} triples
 * @param {*} predicateMapping all predicates to the right
 * @returns
 */
function triplesToResources(triples, predicateMapping = {}) {
  return Array.from(triples.reduce(
    (resources, triple) => {
      const { s: { value: s }, p: { value: p }, o: { value: o } } = triple;

      // First handle the forward predicate, without a ^,
      // In which case we use s as the resource. If a mapping
      // is encountered, it will be used, otherwise the bare
      // predicate is used
      let mappedP = predicateMapping[p] ?? p;
      if (mappedP) {
        const resource = resources.get(s) ?? {};
        resource.uri = s;
        if (Object.hasOwn(resource, mappedP)) {
          resource[mappedP].push(o);
        } else {
          resource[mappedP] = [o];
        }
        resources.set(s, resource);
      }

      // Now handle the inverse predicate, with a ^,
      // and use o as the resource
      mappedP = predicateMapping[`^${p}`];
      if (mappedP) {
        const resource = resources.get(o) ?? {};
        resource.uri = o;
        if (Object.hasOwn(resource, mappedP)) {
          resource[mappedP].push(s);
        } else {
          resource[mappedP] = [s];
        }
        resources.set(o, resource);
      }

      return resources;
    },
    new Map(),
  ).values());
}

function resourceToTriples(resource) {
  const { uri, incoming, outgoing } = resource;
  const triples = [];
  for (const [p, o] of Object.entries(outgoing)) {
    if (Array.isArray(o)) {
      for (const obj of o) {
        triples.push([sparqlEscape(uri, 'uri'), sparqlEscape(p, 'uri'), sparqlEscape(obj.value, obj.type)]);
      }
    } else {
      triples.push([sparqlEscape(uri, 'uri'), sparqlEscape(p, 'uri'), sparqlEscape(o.value, o.type)]);
    }
  }
  for (const [p, s] of Object.entries(incoming)) {
    triples.push([sparqlEscape(s, 'uri'), sparqlEscape(p, 'uri'), sparqlEscape(uri, 'uri')]);
  }

  return triples;
}

/**
 * Reduce a result set to a set with a single entry per URI.
 *
 * A result set is in essence a table whose columns are the variables selected
 * in a SELECT query and whose rows are the different matching combinations of
 * variables. This function will collapse these rows on a URI basis, first by
 * finding a variable to represent the URI of a resource (and if no such
 * variable can be found, an error will be thrown), afterwards all other
 * variables will be collapsed into one entry. If multiple rows in the original
 * result set contain the same value for the same variable, subsequent entries
 * are ignored. If multiple rows contain different variables, they're returned
 * as an array by this function.
 */
function reduceResultSet(resultSet, uriVariable = undefined) {
  const head = resultSet.head;
  const bindings = resultSet.results.bindings;

  if (bindings.length === 0) {
    return null;
  }

  const uriVar = uriVariable ?? head.vars.at(0);

  const resultMap = bindings.reduce((map, binding) => {
    const uri = binding[uriVar];
    const resource = map.get(uri.value) ?? {};


    resource.uri = uri;
    for (const variable of head.vars) {
      if (variable === 'uri') continue;

      const currentVar = binding[variable];
      const previousVar = resource[variable];

      if (previousVar === undefined) {
        resource[variable] = currentVar;
      } else if (Array.isArray(previousVar)) {
        previousVar.push(currentVar);
      } else if (previousVar.value !== currentVar.value) {
        resource[variable] = [previousVar, currentVar];
      }
    }

    map.set(uri.value, resource);
    return map;
  }, new Map());

  const results = Array.from(resultMap.values());

  const destructureVariable = (variable) => {
    if (variable) {
      try {
        const { datatype, value } = variable;
        if (datatype === 'http://www.w3.org/2001/XMLSchema#integer') {
          return parseInt(value);
        } else if (datatype === 'http://www.w3.org/2001/XMLSchema#dateTime') {
          return new Date(value);
        } else {
          return value;
        }
      } catch {
        return undefined;
      }
    }
  };
  return results.map((result) => {
    for (const variable of head.vars) {
      let currentVar = result[variable];
      let parsed = undefined;
      if (Array.isArray(currentVar)) {
        parsed = currentVar.map(destructureVariable);
      } else {
        parsed = destructureVariable(currentVar);
      }
      result[variable] = parsed;
    }
    return result;
  });
}

export {
  responseToTriples,
  triplesToResources,
  resourceToTriples,
  reduceResultSet,
}
