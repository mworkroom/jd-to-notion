export async function collectPaginated(queryPage) {
  const results = [];
  let cursor = undefined;

  while (true) {
    const page = await queryPage(cursor);
    results.push(...(page?.results ?? []));

    if (!page?.has_more || !page.next_cursor) {
      break;
    }

    cursor = page.next_cursor;
  }

  return results;
}

export async function queryDataSourcePages(client, request) {
  return collectPaginated((cursor) => {
    const query = { ...request };
    if (cursor) {
      query.start_cursor = cursor;
    }
    return client.dataSources.query(query);
  });
}
