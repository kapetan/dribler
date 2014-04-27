<% events.forEach(function(event) { %>
**<%= format.time(event.time) %>** <%= markdown(event) %>
<% }) %>