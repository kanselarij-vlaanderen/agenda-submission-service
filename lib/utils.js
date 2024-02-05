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
function triplesToResources(triples, predicateMapping={}) {
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

export {
  responseToTriples,
  triplesToResources,
  resourceToTriples,
}
