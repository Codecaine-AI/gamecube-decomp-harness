# L5 Function/Method Docstring Template

Templates for function and method documentation that describe the "What" — contracts, inputs/outputs, and guarantees.

## Core Template

<template>

    def function_name(args):
        """
        Do: [Action verb] [direct object] [context].

        Logic/Flow: (Include if multi-step)
        1. [Step 1]
        2. [Step 2]

        Inputs:
        - [param]: [constraints]

        Outputs:
        - [return type]: [guarantees]

        Side Effects:
        - [Database writes, events emitted, external calls]

        Errors:
        - [Exception]: [Condition]
        """

</template>

## Scaling by Complexity

### Simple Function

For trivial functions, a single line suffices:

```python
def get_user_name(user_id: str) -> str:
    """Do: Retrieve user's display name from cache or database."""
```

### Medium Complexity

Add inputs/outputs when constraints matter:

```python
def calculate_interest(principal: float, rate: float, time: float) -> float:
    """
    Do: Calculate compound interest over time period.

    Inputs:
    - principal: Initial amount (> 0)
    - rate: Annual rate (0-1)
    - time: Years (>= 0)

    Outputs:
    - Final amount after interest
    """
```

### Complex Function

Include logic flow and side effects:

```python
async def on_payment_received(event: PaymentEvent) -> None:
    """
    Do: Process payment and update order status.

    Logic/Flow:
    1. Validate payment amount matches order
    2. Update order status to PAID
    3. Send confirmation email
    4. Publish OrderCompleted event

    Side Effects:
    - Updates order in database
    - Sends confirmation email
    - Publishes OrderCompleted event

    Errors:
    - PaymentMismatchError: Amount doesn't match order
    - Logs and re-queues on transient failures
    """
```

## Guidelines

### Include What Matters

- **Do**: Always include. Start with action verb.
- **Logic/Flow**: When function has non-obvious multi-step process.
- **Inputs**: When constraints aren't obvious from types.
- **Outputs**: When return value has guarantees beyond the type.
- **Side Effects**: Always document external state changes.
- **Errors**: When failure modes aren't obvious.

### Skip the Obvious

- Don't repeat the function signature
- Don't explain HOW (that's implementation)
- Don't document private helpers unless complex
