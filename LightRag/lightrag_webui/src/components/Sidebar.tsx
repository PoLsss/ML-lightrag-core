@tailwind base;
@tailwind components;
@tailwind utilities;

/* small theme tweaks */
body {
  @apply bg-gray-900 text-gray-100;
}
.tooltip {
  @apply bg-gray-800 text-gray-100 p-2 rounded shadow-lg text-sm;
}

// Tìm đoạn render menu items và ẩn Retrieval, API
{menuItems
  .filter(item => item.key !== 'retrieval' && item.key !== 'api')
  .map(item => (
    <li key={item.key}>
      <a href={item.url}>{item.name}</a>
    </li>
  ))}