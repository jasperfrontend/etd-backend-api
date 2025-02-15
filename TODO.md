# TODO

`POST /inventory/add` outputs:
```json
{
    "success": "Item added to inventory.",
    "item_id": "7d75838d-6d18-4993-a116-77e5a5da773b",
    "new_quantity": 1
}
```
but `POST /inventory/use` outputs:
```json
{
    "message": "Used Med Pack."
}
```

also `POST /inventory/remove` doesn't check for `player_id` and outputs:
```json
{
    "message": "Removed 1x Med Pack from inventory. 0x Med Pack left."
}
```
Fix this output so `/add`, `/remove` and `/use` output the same message as `/add`.

On line `383` of `server.js`:
```js
  for (let item of items.rows) {
    await pool.query("CALL add_inventory($1, $2, 1)", [streamerId, item.id]); // Calls stored procedure
  }
```
This whole procedure doesn't exist yet.