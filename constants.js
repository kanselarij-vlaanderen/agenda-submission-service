const TYPES = {
  activity: 'http://www.w3.org/ns/prov#Activity',
  submissionActivity: 'http://mu.semte.ch/vocabularies/ext/Indieningsactiviteit',
  agendaActivity: 'https://data.vlaanderen.be/ns/besluitvorming#Agendering',
  decisionActivity: 'https://data.vlaanderen.be/ns/besluitvorming#Beslissingsactiviteit',
  treatment: 'http://data.vlaanderen.be/ns/besluit#BehandelingVanAgendapunt',
  agendaitem: 'http://data.vlaanderen.be/ns/besluit#Agendapunt',
  agenda: 'https://data.vlaanderen.be/ns/besluitvorming#Agenda',
  meeting: 'http://data.vlaanderen.be/ns/besluit#Vergaderactiviteit',
  subcase: 'https://data.vlaanderen.be/ns/dossier#Procedurestap',
  newsItem: 'http://mu.semte.ch/vocabularies/ext/Nieuwsbericht',
  signFlow: 'http://mu.semte.ch/vocabularies/ext/handtekenen/Handtekenaangelegenheid',
};

const CONCEPTS = {
  DECISION_RESULT_CODES: {
    POSTPONED: 'http://themis.vlaanderen.be/id/concept/beslissing-resultaatcodes/a29b3ffd-0839-45cb-b8f4-e1760f7aacaa',
    ACKNOWLEDGED: 'http://themis.vlaanderen.be/id/concept/beslissing-resultaatcodes/9f342a88-9485-4a83-87d9-245ed4b504bf',
  },
  ACCEPTANCE_STATUSES: {
    NOT_YET_OK: 'http://kanselarij.vo.data.gift/id/concept/goedkeurings-statussen/B72D1561-8172-466B-B3B6-FCC372C287D0',
    OK: 'http://kanselarij.vo.data.gift/id/concept/goedkeurings-statussen/CC12A7DB-A73A-4589-9D53-F3C2F4A40636',
  },
  AGENDA_ITEM_TYPES: {
    ANNOUNCEMENT: 'http://themis.vlaanderen.be/id/concept/agendapunt-type/8f8adcf0-58ef-4edc-9e36-0c9095fd76b0',
  },
};

const URI_BASES = {
  agendaActivity: 'http://themis.vlaanderen.be/id/agendering/',
  decisionActivity: 'http://themis.vlaanderen.be/id/beslissingsactiviteit/',
  submissionActivity: 'http://kanselarij.vo.data.gift/id/indieningsactiviteit/',
  treatment: 'http://themis.vlaanderen.be/id/behandeling-van-agendapunt/',
  newsItem: 'http://themis.vlaanderen.be/id/nieuwsbericht/',
  agendaitem: 'http://themis.vlaanderen.be/id/agendapunt/',
};

const GRAPHS = {
  KANSELARIJ: 'http://mu.semte.ch/graphs/organizations/kanselarij',
  SUBMISSION: 'http://mu.semte.ch/graphs/system/submissions',
}

export {
  TYPES,
  CONCEPTS,
  URI_BASES,
  GRAPHS,
}
