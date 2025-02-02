## How to Use This Tool

1. **Make the Script Executable:**

   ```bash
   chmod +x send_command.sh
   ```

2. **Set Your API Key (if not already set):**

   ```bash
   export API_KEY="YOUR_SECRET_KEY"
   ```

3. **Send a Command:**

   For example, to send a command to type text into an input element:

   ```bash
   ./send_command.sh --action type --xpath '//*[@id="username"]' --text "myUserName"
   ```

   Or, to send a command to simulate clicking at coordinates:

   ```bash
   ./send_command.sh --action clickAtCoordinates --x 150 --y 300
   ```

4. **Additional Options:**  
   You can also specify a URL for navigation:

   ```bash
   ./send_command.sh --action navigate --url "https://example.com"
   ```

   And override the default requestId or timestamp if needed:

   ```bash
   ./send_command.sh --action screenshot --requestId req-005 --timestamp "2025-02-02T12:20:00Z"
   ```
