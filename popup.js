document.addEventListener('DOMContentLoaded', () => {
  const searchBox = document.getElementById('searchBox');
  const resultsDiv = document.getElementById('results');

  searchBox.focus();

  searchBox.addEventListener('input', async () => {
    const query = searchBox.value.toLowerCase();
    const tabs = await chrome.tabs.query({});
    
    resultsDiv.innerHTML = '';
    
    const filteredTabs = tabs.filter(tab => 
      tab.title.toLowerCase().includes(query) || 
      tab.url.toLowerCase().includes(query)
    );

    filteredTabs.forEach(tab => {
      const div = document.createElement('div');
      div.className = 'result-item';
      div.textContent = tab.title;
      div.addEventListener('click', () => {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
      });
      resultsDiv.appendChild(div);
    });
  });

  searchBox.addEventListener('keydown', (e) => {
    const items = document.getElementsByClassName('result-item');
    if (e.key === 'Enter' && items.length > 0) {
      items[0].click();
    }
  });
});
