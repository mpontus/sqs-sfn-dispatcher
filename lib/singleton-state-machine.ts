// File: /home/embarrassedrobot/sqs-sfn-dispatcher/lib/sqs-sfn-dispatcher.ts
import { Stack } from "aws-cdk-lib";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

export interface SingletonStateMachineProps extends sfn.StateMachineProps {
  stateMachinePurpose?: string;
  uuid: string;
}

/**
 * A singleton state machine that ensures only one instance exists per account/region
 */
export class SingletonStateMachine extends sfn.StateMachine {
  /**
   * Returns a singleton state machine for the given definition and UUID
   */
  public static getOrCreate(
    scope: Construct,
    id: string,
    props: SingletonStateMachineProps
  ): sfn.StateMachine {
    const stack = Stack.of(scope);
    const uniqueId = `${props.stateMachinePurpose ?? "SingletonStateMachine"}-${
      props.uuid
    }`;

    // Check if this state machine already exists
    const existing = stack.node.tryFindChild(uniqueId) as sfn.StateMachine;
    if (existing) {
      return existing;
    }

    // Create a new state machine with the unique ID
    return new SingletonStateMachine(stack, uniqueId, props);
  }

  private constructor(
    scope: Construct,
    id: string,
    props: SingletonStateMachineProps
  ) {
    super(scope, id, props);
  }
}
