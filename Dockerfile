FROM nginx:alpine

# Spider Paint is served as static HTML/JS; no application build step.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/

EXPOSE 8080
