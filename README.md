# Agenda submission service

Microservice used to submit subcases onto agendas in Kaleidos.

## Tutorials

### Add the service to a stack

Add the following snippet to your `docker-compose.yml`:

``` yaml
agenda-submission:
  image: kanselarij/agenda-submission-service
```

Add rules to the dispatcher configuration file to dispatch requests to this service:

``` elixir
match "/meetings/:meeting_id/submit", @json_service do
  Proxy.forward conn, [], "http://agenda-submission/meetings/" <> meeting_id <> "/submit"
end
```

## Reference

### API

#### POST `/meetings/:meeting_id/submit`

Submit the subcase onto the latest agenda of the meeting.

##### Request body

``` json
{
  "subcase": "http://themis.vlaanderen.be/id/procedurestap/XXXXXX",
  "formallyOk": true,
  "privateComment": "Private comment to be placed on the created agendaitem"
}
```

##### Response

###### 200 OK

- When the submission the succeeded. The response body will contain bare JSON:API of the newly created agendaitem, providing only its ID so that it can be fetched using the resources service

###### 400 Bad Request

- When the meeting ID path parameter is left empty
- When the subcase URI is not provided in the body of the request
- When the provided meeting is already closed (you cannot submit a subcase on a closed meeting)
- When the provided subcase is already submitted and is not postponed

###### 404 Not Found

- When the service cannot find data about either the meeting, the subcase, or the latest agenda of the meeting
