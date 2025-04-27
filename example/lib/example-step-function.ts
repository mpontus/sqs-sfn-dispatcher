import { Construct } from 'constructs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';

/**
 * Step function that succeeds when input value is even and fails when input value is odd.
 */
export class ExampleStepFunction extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(
        new sfn.Pass(this, "Pass")
      )
    })
    this.stateMachine = stateMachine;
  }
}